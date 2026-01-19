import { db, stmts } from './database.js';
import { RawMeasurementRow, AnalysisWindowRow, TrackerState } from './types.js';

const ANALYSIS_WINDOW_MS = 60 * 1000; // 1 minute analysis windows
const MIN_SAMPLES_FOR_CONFIDENCE = 3;
const MAX_NOISE_THRESHOLD = 0.5;
const BASELINE_HISTORY_SIZE = 1000;

export class AnalysisEngine {
    private static instance: AnalysisEngine;
    
    // In-memory cache of baselines to avoid constant DB reads
    private baselines: Map<string, { median: number, iqr: number, min: number }> = new Map();

    private constructor() {}

    public static getInstance(): AnalysisEngine {
        if (!AnalysisEngine.instance) {
            AnalysisEngine.instance = new AnalysisEngine();
        }
        return AnalysisEngine.instance;
    }

    /**
     * Run analysis for a specific target.
     * This should be called periodically or after new measurements.
     */
    public runAnalysis(targetId: string, channel: 'whatsapp' | 'signal') {
        try {
            // 1. Update Baselines (Long-term learning)
            this.updateBaselines(targetId, channel);

            // 2. Generate Analysis Window for the immediate past
            const now = Date.now();
            const startOfWindow = now - ANALYSIS_WINDOW_MS;
            
            this.computeWhyWindow(targetId, channel, startOfWindow, now);
        } catch (err) {
            console.error(`[Analysis] Error for ${targetId}:`, err);
        }
    }

    private updateBaselines(targetId: string, channel: 'whatsapp' | 'signal') {
        const rows = db.prepare(`
            SELECT target_rtt_ms 
            FROM raw_measurements 
            WHERE target_id = ? AND channel = ? AND timeout = 0 AND target_rtt_ms IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT ?
        `).all(targetId, channel, BASELINE_HISTORY_SIZE) as { target_rtt_ms: number }[];

        const rtts = rows.map(r => r.target_rtt_ms);
        
        if (rtts.length < 10) return; // Not enough data yet

        const stats = this.calculateStats(rtts);
        
        // Decay strategy: We could weight recent samples higher, but for now simple sliding window
        // Store in DB
        stmts.updateBaseline.run({
            target_id: targetId,
            channel: channel,
            min_rtt_ms: stats.min,
            median_rtt_ms: stats.median,
            iqr_ms: stats.iqr,
            updated_at: Date.now(),
            sample_count: rtts.length
        });

        this.baselines.set(targetId, stats);
    }

    private computeWhyWindow(targetId: string, channel: 'whatsapp' | 'signal', start: number, end: number) {
        // Fetch raw measurements in this window
        const measurements = db.prepare(`
            SELECT * FROM raw_measurements 
            WHERE target_id = ? 
            AND channel = ? 
            AND timestamp >= ? 
            AND timestamp <= ?
        `).all(targetId, channel, start, end) as RawMeasurementRow[];

        if (measurements.length === 0) {
            // No data, cannot infer.
            return;
        }

        const baseline = this.baselines.get(targetId);
        
        // 1. Calculate Noise Score
        // Factors: Local Network RTT Variance + Target RTT Variance
        const noiseScore = this.calculateNoiseScore(measurements);

        // 2. Calculate Responsiveness
        // Factors: (TargetRTT - LocalRTT) against Baseline
        const samples = measurements.length;
        // Simple heuristic: 
        // If timeout, responsiveness = 0
        // If (RTT - Local) < (Median + IQR), responsiveness = 1
        // Else responsiveness scales down
        
        let totalResponsiveness = 0;
        let validSamples = 0;

        for (const m of measurements) {
            if (m.timeout) {
                totalResponsiveness += 0;
                validSamples++;
            } else if (m.target_rtt_ms !== null) {
                const localRtt = m.local_network_rtt_ms || 0;
                const normalizedRtt = Math.max(0, m.target_rtt_ms - localRtt);
                
                // If we don't have a baseline yet, we can't judge well. Assume somewhat responsive if < 500ms?
                // But strict mode says: "Baselines must converge before inference is allowed."
                if (!baseline) {
                    continue; // Skip this sample for responsiveness if no baseline
                }

                const threshold = baseline.median + (baseline.iqr * 1.5); // 1.5 IQR rule
                
                if (normalizedRtt <= threshold) {
                    totalResponsiveness += 1.0;
                } else if (normalizedRtt <= threshold * 2) {
                    totalResponsiveness += 0.5; // Slow/Jittery
                } else {
                    totalResponsiveness += 0.1; // Very slow
                }
                validSamples++;
            }
        }
        
        let avgResponsiveness = validSamples > 0 ? totalResponsiveness / validSamples : 0;

        // 3. Calculate Confidence
        // Penalize for: High Noise, Low Sample Count, Missing Baseline
        let confidence = 1.0;
        
        // If we don't have a baseline, we can still have HIGH CONFIDENCE if the RTT is extremely low (e.g. < 500ms above local)
        // This is the "fast path" for obvious online states.
        let fastPathConfidence = false;
        if (!baseline && samples >= MIN_SAMPLES_FOR_CONFIDENCE) {
             let lowLatencySamples = 0;
             for (const m of measurements) {
                 if (m.target_rtt_ms !== null) {
                      const local = m.local_network_rtt_ms || 0;
                      if ((m.target_rtt_ms - local) < 1000) lowLatencySamples++;
                 }
             }
             if (lowLatencySamples === samples) {
                 confidence = 0.8; // Decent confidence even without baseline if consistent low latency
                 fastPathConfidence = true;
             }
        } else if (!baseline) {
            confidence *= 0.1; // Very low confidence if no baseline and not fast-path
        }
        
        if (noiseScore > MAX_NOISE_THRESHOLD) confidence *= 0.0; // Noise Gating!
        if (samples < MIN_SAMPLES_FOR_CONFIDENCE) confidence *= 0.5;

        // 4. Derive State
        let state: TrackerState = 'Unknown';
        
        if (confidence > 0.6) {
            if (avgResponsiveness > 0.8 || fastPathConfidence) state = 'Online';
            else if (avgResponsiveness < 0.2) state = 'Standby'; 
            else state = 'Standby';
        } else {
            state = 'Unknown';
        }

        // If all samples were timeouts, and confidence is okay (low noise), we can say Offline
        if (confidence > 0.6 && avgResponsiveness === 0.0) {
            state = 'OFFLINE';
        }

        stmts.insertAnalysisWindow.run({
            start_timestamp: start,
            end_timestamp: end,
            target_id: targetId,
            channel: channel,
            sample_count: samples,
            noise_score: noiseScore,
            responsiveness_score: avgResponsiveness,
            confidence_score: confidence,
            derived_state: state
        });
    }

    private calculateNoiseScore(measurements: RawMeasurementRow[]): number {
        // Simple variance calculation of (Target - Local)
        // High variance = High noise
        let diffs: number[] = [];
        
        for (const m of measurements) {
            if (m.target_rtt_ms !== null && m.local_network_rtt_ms !== null) {
                diffs.push(Math.abs(m.target_rtt_ms - m.local_network_rtt_ms));
            }
        }

        if (diffs.length < 2) return 0; // Not enough data to judge noise

        const stats = this.calculateStats(diffs);
        // Normalize noise: e.g. if IQR > 500ms -> 1.0 noise
        const normalizedNoise = Math.min(1.0, stats.iqr / 500); 
        
        return normalizedNoise;
    }

    private calculateStats(values: number[]): { median: number, iqr: number, min: number } {
        if (values.length === 0) return { median: 0, iqr: 0, min: 0 };
        
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        const min = sorted[0];
        
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;

        return { median, iqr, min };
    }
}
