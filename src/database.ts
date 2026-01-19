import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'tracker.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

export const db = new Database(DB_PATH, { verbose: process.env.DEBUG ? console.log : undefined });

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

/**
 * Initialize the database schema
 */
export function initDatabase() {
    const migration = db.transaction(() => {
        // 1. Raw Measurements (Immutable, Append-Only)
        // Stores the raw RTT data from probes.
        db.prepare(`
            CREATE TABLE IF NOT EXISTS raw_measurements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                channel TEXT NOT NULL,         -- 'whatsapp' or 'signal'
                target_id TEXT NOT NULL,       -- JID or Phone Number
                target_rtt_ms INTEGER,         -- NULL if timeout
                timeout BOOLEAN NOT NULL,
                local_network_rtt_ms INTEGER,  -- Control signal at time of probe
                probe_method TEXT NOT NULL,    -- 'delete' or 'reaction' or 'message'
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `).run();

        db.prepare(`CREATE INDEX IF NOT EXISTS idx_raw_timestamp ON raw_measurements(timestamp)`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_raw_target ON raw_measurements(target_id)`).run();

        // 2. Local Network Metrics (Control Signal)
        // Continuous background measurements of local network health
        db.prepare(`
            CREATE TABLE IF NOT EXISTS local_network_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                rtt_ms INTEGER,                -- NULL if timeout
                timeout BOOLEAN NOT NULL,
                variance_ms INTEGER,           -- Jitter/Variance in this window
                packet_loss_rate REAL,         -- 0.0 to 1.0 estimate
                reference_target TEXT NOT NULL -- e.g. '1.1.1.1'
            )
        `).run();

        db.prepare(`CREATE INDEX IF NOT EXISTS idx_local_timestamp ON local_network_metrics(timestamp)`).run();

        // 3. Baselines (Adaptive Stats)
        // Learned statistical models for each target
        db.prepare(`
            CREATE TABLE IF NOT EXISTS baselines (
                target_id TEXT PRIMARY KEY,
                channel TEXT NOT NULL,
                min_rtt_ms INTEGER,
                median_rtt_ms INTEGER,
                iqr_ms INTEGER,
                updated_at INTEGER NOT NULL,
                sample_count INTEGER DEFAULT 0
            )
        `).run();

        // 4. Analysis Windows (Derived Inference)
        // The output of the analysis engine.
        // This table CAN be cleared and re-generated during retrospective analysis.
        db.prepare(`
            CREATE TABLE IF NOT EXISTS analysis_windows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_timestamp INTEGER NOT NULL,
                end_timestamp INTEGER NOT NULL,
                target_id TEXT NOT NULL,
                channel TEXT NOT NULL,
                
                -- Metrics
                sample_count INTEGER NOT NULL,
                noise_score REAL NOT NULL,        -- 0.0 to 1.0 (1.0 = too noisy)
                responsiveness_score REAL,        -- 0.0 to 1.0 (1.0 = highly responsive)
                confidence_score REAL NOT NULL,   -- 0.0 to 1.0 (1.0 = certain)
                
                -- State (Derived from scores, provided for convenience)
                derived_state TEXT NOT NULL,      -- 'Online', 'Standby', 'Unknown'
                
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `).run();

        db.prepare(`CREATE INDEX IF NOT EXISTS idx_analysis_target_time ON analysis_windows(target_id, start_timestamp)`).run();
    });


    try {
        migration();
        console.log('[Database] Schema initialized.');
    } catch (err: any) {
        console.error('[Database] Schema initialization failed:', err.message);
        throw err;
    }
}

// Prepare commonly used statements for performance
// Cache variable for lazy preparation
const _cache: any = {};

export const stmts = {
    get insertRawMeasurement() {
        if (!_cache.insertRawMeasurement) {
            _cache.insertRawMeasurement = db.prepare(`
                INSERT INTO raw_measurements (timestamp, channel, target_id, target_rtt_ms, timeout, local_network_rtt_ms, probe_method)
                VALUES (@timestamp, @channel, @target_id, @target_rtt_ms, @timeout, @local_network_rtt_ms, @probe_method)
            `);
        }
        return _cache.insertRawMeasurement;
    },
    
    get insertLocalMetric() {
        if (!_cache.insertLocalMetric) {
            _cache.insertLocalMetric = db.prepare(`
                INSERT INTO local_network_metrics (timestamp, rtt_ms, timeout, variance_ms, packet_loss_rate, reference_target)
                VALUES (@timestamp, @rtt_ms, @timeout, @variance_ms, @packet_loss_rate, @reference_target)
            `);
        }
        return _cache.insertLocalMetric;
    },

    get getBaselines() {
        if (!_cache.getBaselines) {
            _cache.getBaselines = db.prepare(`SELECT * FROM baselines WHERE target_id = ?`);
        }
        return _cache.getBaselines;
    },
    
    get updateBaseline() {
        if (!_cache.updateBaseline) {
            _cache.updateBaseline = db.prepare(`
                INSERT INTO baselines (target_id, channel, min_rtt_ms, median_rtt_ms, iqr_ms, updated_at, sample_count)
                VALUES (@target_id, @channel, @min_rtt_ms, @median_rtt_ms, @iqr_ms, @updated_at, @sample_count)
                ON CONFLICT(target_id) DO UPDATE SET
                    min_rtt_ms = excluded.min_rtt_ms,
                    median_rtt_ms = excluded.median_rtt_ms,
                    iqr_ms = excluded.iqr_ms,
                    updated_at = excluded.updated_at,
                    sample_count = excluded.sample_count
            `);
        }
        return _cache.updateBaseline;
    },

    get insertAnalysisWindow() {
        if (!_cache.insertAnalysisWindow) {
            _cache.insertAnalysisWindow = db.prepare(`
                INSERT INTO analysis_windows (start_timestamp, end_timestamp, target_id, channel, sample_count, noise_score, responsiveness_score, confidence_score, derived_state)
                VALUES (@start_timestamp, @end_timestamp, @target_id, @channel, @sample_count, @noise_score, @responsiveness_score, @confidence_score, @derived_state)
            `);
        }
        return _cache.insertAnalysisWindow;
    },
    
    get getLatestAnalysis() {
        if (!_cache.getLatestAnalysis) {
            _cache.getLatestAnalysis = db.prepare(`
                SELECT * FROM analysis_windows 
                WHERE target_id = ? 
                ORDER BY end_timestamp DESC 
                LIMIT 1
            `);
        }
        return _cache.getLatestAnalysis;
    },

    get getAvailableDates() {
        if (!_cache.getAvailableDates) {
            _cache.getAvailableDates = db.prepare(`
                SELECT DISTINCT date(timestamp / 1000, 'unixepoch', 'localtime') as day 
                FROM raw_measurements 
                WHERE target_id = ?
                ORDER BY day DESC
            `);
        }
        return _cache.getAvailableDates;
    },

    get getHistoricalData() {
        if (!_cache.getHistoricalData) {
            // We join with analysis windows if possible, or just raw measurements
            // For now, let's return raw measurements aggregated or analysis windows
            // The user wants RTT graphs, so raw_measurements is better for granular RTT
            _cache.getHistoricalData = db.prepare(`
                SELECT 
                    timestamp,
                    target_rtt_ms as rtt,
                    probe_method,
                    CASE 
                        WHEN local_network_rtt_ms IS NOT NULL THEN local_network_rtt_ms 
                        ELSE 0 
                    END as baseline,
                    CASE 
                        WHEN target_rtt_ms > 0 THEN 'Online' 
                        ELSE 'Offline' 
                    END as state
                FROM raw_measurements
                WHERE target_id = ? 
                AND date(timestamp / 1000, 'unixepoch', 'localtime') = ?
                ORDER BY timestamp ASC
            `);
        }
        return _cache.getHistoricalData;
    }
};
