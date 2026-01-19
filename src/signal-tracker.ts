import WebSocket from 'ws';
import { stmts } from './database.js';
import { LocalNetworkMonitor } from './local-network.js';

export type ProbeMethod = 'reaction' | 'message';

interface JsonRpcMessage {
    jsonrpc: string;
    method?: string;
    params?: {
        envelope?: {
            source?: string;
            sourceNumber?: string;
            timestamp?: number;
            receiptMessage?: {
                when: number;
                isDelivery: boolean;
                timestamps: number[];
            };
        };
    };
}

export class SignalTracker {
    private apiUrl: string;
    private senderNumber: string;
    private targetNumber: string;
    private isTracking: boolean = false;
    private probeMethod: ProbeMethod = 'reaction';
    private ws: WebSocket | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    
    // Event for Server
    public onMeasurement?: (number: string) => void;

    // Serialized Probe Logic
    private pendingProbeStartTime: number | null = null;
    private pendingProbeTimeout: NodeJS.Timeout | null = null;
    private probeResolve: (() => void) | null = null;

    constructor(
        apiUrl: string,
        senderNumber: string,
        targetNumber: string,
        debugMode: boolean = false
    ) {
        this.apiUrl = apiUrl.replace(/\/$/, '');
        this.senderNumber = senderNumber;
        this.targetNumber = targetNumber;
    }

    public setProbeMethod(method: ProbeMethod) {
        this.probeMethod = method;
        console.log(`[Signal] Probe method changed to: ${method}`);
    }

    public getProbeMethod(): ProbeMethod {
        return this.probeMethod;
    }

    public async startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;
        console.log(`[Signal] Tracking started for ${this.targetNumber}`);

        this.connectWebSocket();
        this.probeLoop();
    }

    public stopTracking() {
        this.isTracking = false;

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.pendingProbeTimeout) {
            clearTimeout(this.pendingProbeTimeout);
            this.pendingProbeTimeout = null;
        }
        this.pendingProbeStartTime = null;
        if (this.probeResolve) {
            this.probeResolve();
            this.probeResolve = null;
        }

        console.log('[Signal] Tracking stopped');
    }

    private connectWebSocket() {
        if (!this.isTracking) return;

        const wsUrl = this.apiUrl.replace('http', 'ws') + '/v1/receive/' + encodeURIComponent(this.senderNumber);
        
        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                console.log('[Signal] WebSocket connected');
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const message = JSON.parse(data.toString()) as JsonRpcMessage;
                    this.processJsonRpcMessage(message);
                } catch (err) {
                    // ignore parse errors
                }
            });

            this.ws.on('close', () => {
                this.scheduleReconnect();
            });

            this.ws.on('error', () => {
                this.scheduleReconnect();
            });
        } catch (err) {
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (!this.isTracking) return;
        if (this.reconnectTimeout) return;

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (this.isTracking) {
                this.connectWebSocket();
            }
        }, 5000);
    }

    private processJsonRpcMessage(message: any) {
        let envelope = message.params?.envelope || message.envelope;
        if (!envelope) return;

        const sourceNumber = envelope.sourceNumber || envelope.source;

        // Check for Delivery Receipt
        if (envelope.receiptMessage?.isDelivery) {
            if (this.pendingProbeStartTime !== null && sourceNumber === this.targetNumber) {
                const receiptTime = Date.now();
                const rtt = receiptTime - this.pendingProbeStartTime;

                if (this.pendingProbeTimeout) {
                    clearTimeout(this.pendingProbeTimeout);
                    this.pendingProbeTimeout = null;
                }

                this.logMeasurement(rtt, false);

                this.pendingProbeStartTime = null;
                if (this.probeResolve) {
                    this.probeResolve();
                    this.probeResolve = null;
                }
            }
        }
    }

    private async probeLoop() {
        while (this.isTracking) {
            try {
                await this.sendSerializedProbe();
            } catch (err) {
                // ignore
            }
            const delay = Math.floor(Math.random() * 1000) + 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    private async sendSerializedProbe(): Promise<void> {
        return new Promise<void>(async (resolve) => {
            this.probeResolve = resolve;
            this.pendingProbeStartTime = Date.now();

            await this.sendProbe();

            this.pendingProbeTimeout = setTimeout(() => {
                if (this.pendingProbeStartTime !== null) {
                    const elapsed = Date.now() - this.pendingProbeStartTime;
                    this.logMeasurement(null, true); // Timeout
                    
                    this.pendingProbeStartTime = null;
                    this.pendingProbeTimeout = null;
                    if (this.probeResolve) {
                        this.probeResolve();
                        this.probeResolve = null;
                    }
                }
            }, 15000);
        });
    }

    private async sendProbe() {
        if (this.probeMethod === 'reaction') {
            await this.sendReactionProbe();
        } else {
            await this.sendMessageProbe();
        }
    }

    private async sendReactionProbe() {
        const timestamp = Date.now();
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];

        try {
            await fetch(`${this.apiUrl}/v1/reactions/${encodeURIComponent(this.senderNumber)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reaction: randomReaction,
                    recipient: this.targetNumber,
                    target_author: this.targetNumber,
                    timestamp: timestamp - 86400000 
                })
            });
        } catch (err) {
            // ignore
        }
    }

    private async sendMessageProbe() {
        try {
            await fetch(`${this.apiUrl}/v2/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: this.senderNumber,
                    recipients: [this.targetNumber],
                    message: '\u200B' 
                })
            });
        } catch (err) {
            // ignore
        }
    }

    private logMeasurement(rtt: number | null, isTimeout: boolean) {
        const localRtt = LocalNetworkMonitor.getInstance().getCurrentRTT();
        
        try {
            stmts.insertRawMeasurement.run({
                timestamp: Date.now(),
                channel: 'signal',
                target_id: this.targetNumber,
                target_rtt_ms: rtt,
                timeout: isTimeout ? 1 : 0,
                local_network_rtt_ms: localRtt,
                probe_method: this.probeMethod
            });
            
            if (this.onMeasurement) {
                this.onMeasurement(this.targetNumber);
            }
        } catch (e) {
            console.error('[Signal] Failed to save measurement:', e);
        }
    }
}

export async function getSignalAccounts(apiUrl: string): Promise<string[]> {
    try {
        const response = await fetch(`${apiUrl}/v1/accounts`);
        if (response.ok) {
            const data = await response.json();
            return data.map((acc: any) => acc.number || acc);
        }
    } catch (err) {
        // ignore
    }
    return [];
}

export async function checkSignalNumber(
    apiUrl: string,
    senderNumber: string,
    targetNumber: string
): Promise<{ registered: boolean; error?: string }> {
    try {
        const response = await fetch(
            `${apiUrl}/v1/search/${encodeURIComponent(senderNumber)}?numbers=${encodeURIComponent(targetNumber)}`,
            { signal: AbortSignal.timeout(30000) }
        );

        if (response.ok) {
            const results = await response.json();
            if (Array.isArray(results) && results.length > 0) {
                return { registered: results[0].registered };
            }
        }
        return { registered: false, error: 'Check failed' };
    } catch (err) {
        return { registered: false, error: `${err}` };
    }
}
