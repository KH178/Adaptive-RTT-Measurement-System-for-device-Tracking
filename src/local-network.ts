import net from 'net';
import { stmts } from './database.js';

const PING_INTERVAL_MS = 2000;
const REFERENCE_HOST = '1.1.1.1';
const REFERENCE_PORT = 80;
const TIMEOUT_MS = 1000;

export class LocalNetworkMonitor {
    private static instance: LocalNetworkMonitor;
    private isRunning: boolean = false;
    private timer: NodeJS.Timeout | null = null;
    
    // Store latest metrics for immediate access by trackers
    private lastRtt: number | null = null;
    private packetLossRate: number = 0;
    
    // Rolling window for variance/loss calculation
    private history: { rtt: number | null, timestamp: number }[] = [];
    private readonly HISTORY_SIZE = 50; // Keep last 50 samples (~100s)

    private constructor() {}

    public static getInstance(): LocalNetworkMonitor {
        if (!LocalNetworkMonitor.instance) {
            LocalNetworkMonitor.instance = new LocalNetworkMonitor();
        }
        return LocalNetworkMonitor.instance;
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.loop();
        console.log('[LocalNetwork] Monitor started.');
    }

    public stop() {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        console.log('[LocalNetwork] Monitor stopped.');
    }

    public getCurrentRTT(): number | null {
        return this.lastRtt;
    }
    
    public getPacketLossRate(): number {
        return this.packetLossRate;
    }

    private async loop() {
        if (!this.isRunning) return;

        try {
            const { rtt, success } = await this.tcpPing();
            this.updateStats(success ? rtt : null);
            this.logMetric(success ? rtt : null, !success);
        } catch (err) {
            console.error('[LocalNetwork] Error in loop:', err);
        }

        if (this.isRunning) {
            this.timer = setTimeout(() => this.loop(), PING_INTERVAL_MS);
        }
    }

    private updateStats(rtt: number | null) {
        this.lastRtt = rtt;
        const now = Date.now();
        this.history.push({ rtt, timestamp: now });
        
        if (this.history.length > this.HISTORY_SIZE) {
            this.history.shift();
        }

        // Calculate Packet Loss Rate
        const total = this.history.length;
        const lost = this.history.filter(h => h.rtt === null).length;
        this.packetLossRate = total > 0 ? lost / total : 0;
    }
    
    private logMetric(rtt: number | null, timeout: boolean) {
        // Calculate variance (std dev of RTT) for the current window if enough samples
        let variance = 0;
        const validSamples = this.history.filter(h => h.rtt !== null).map(h => h.rtt as number);
        
        if (validSamples.length > 5) {
            const mean = validSamples.reduce((a, b) => a + b, 0) / validSamples.length;
            const sqDiffs = validSamples.map(v => Math.pow(v - mean, 2));
            const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / validSamples.length;
            variance = Math.sqrt(avgSqDiff);
        }

        try {
            stmts.insertLocalMetric.run({
                timestamp: Date.now(),
                rtt_ms: rtt,
                timeout: timeout ? 1 : 0,
                variance_ms: Math.round(variance),
                packet_loss_rate: this.packetLossRate,
                reference_target: REFERENCE_HOST
            });
        } catch (err) {
            console.error('[LocalNetwork] Failed to log metric:', err);
        }
    }

    private tcpPing(): Promise<{ rtt: number, success: boolean }> {
        return new Promise((resolve) => {
            const start = Date.now();
            const socket = new net.Socket();
            let resolved = false;

            const onDone = (success: boolean) => {
                if (resolved) return;
                resolved = true;
                socket.destroy();
                const rtt = Date.now() - start;
                resolve({ rtt, success });
            };

            socket.setTimeout(TIMEOUT_MS);

            socket.connect(REFERENCE_PORT, REFERENCE_HOST, () => {
                onDone(true);
            });

            socket.on('error', () => {
                onDone(false);
            });

            socket.on('timeout', () => {
                onDone(false);
            });
        });
    }
}
