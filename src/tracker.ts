import { WASocket, proto } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { stmts } from './database.js';
import { LocalNetworkMonitor } from './local-network.js';

const logger = pino({
    level: process.argv.includes('--debug') ? 'debug' : 'silent'
});

export type ProbeMethod = 'delete' | 'reaction';

export class WhatsAppTracker {
    private sock: WASocket;
    private targetJid: string;
    private isTracking: boolean = false;
    private probeStartTimes: Map<string, number> = new Map();
    private probeTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private probeMethod: ProbeMethod = 'delete'; 

    // Event for Server to hook into (e.g. to trigger analysis)
    public onMeasurement?: (jid: string) => void;

    constructor(sock: WASocket, targetJid: string, debugMode: boolean = false) {
        this.sock = sock;
        this.targetJid = targetJid;
    }

    public setProbeMethod(method: ProbeMethod) {
        this.probeMethod = method;
        console.log(`[WhatsApp] Probe method changed to: ${method}`);
    }

    public getProbeMethod(): ProbeMethod {
        return this.probeMethod;
    }

    public async startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;
        console.log(`[WhatsApp] Tracking started for ${this.targetJid}`);

        // Listen for incoming messages/acks
        this.sock.ev.on('messages.update', (updates) => {
            for (const update of updates) {
                if (update.key.remoteJid === this.targetJid && update.key.fromMe) {
                    this.analyzeUpdate(update);
                }
            }
        });

        // Listen for raw receipts (needed for 'inactive' type sometimes)
        this.sock.ws.on('CB:receipt', (node: any) => {
            this.handleRawReceipt(node);
        });
        
        // Start the probe loop
        this.probeLoop();
    }

    public stopTracking() {
        this.isTracking = false;
        // Clear all pending timeouts
        for (const timeoutId of this.probeTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.probeTimeouts.clear();
        this.probeStartTimes.clear();
        console.log('[WhatsApp] Stopping tracking');
    }

    public async getProfilePicture() {
        try {
            return await this.sock.profilePictureUrl(this.targetJid, 'image');
        } catch (err) {
            return null;
        }
    }

    private async probeLoop() {
        while (this.isTracking) {
            try {
                await this.sendProbe();
            } catch (err: any) {
                // Ensure we don't crash the server loop
                logger.error({ err }, 'Error sending probe');
                // Backoff slightly on error
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            // Random interval between 2s and 5s
            const delay = Math.floor(Math.random() * 3000) + 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    private async sendProbe() {
        if (this.probeMethod === 'delete') {
            await this.sendDeleteProbe();
        } else {
            await this.sendReactionProbe();
        }
    }

    private async sendDeleteProbe() {
        try {
            const randomMsgId = this.generateRandomId();
            
            const deleteMessage = {
                delete: {
                    remoteJid: this.targetJid,
                    fromMe: true,
                    id: randomMsgId,
                }
            };

            const startTime = Date.now();
            const result = await this.sock.sendMessage(this.targetJid, deleteMessage);

            if (result?.key?.id) {
                this.recordProbeStart(result.key.id, startTime);
            }
        } catch (err) {
            logger.error(err, '[PROBE-DELETE ERROR]');
        }
    }

    private async sendReactionProbe() {
        try {
            const randomMsgId = this.generateRandomId();
            const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👻', '🔥', '✨', ''];
            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];

            const reactionMessage = {
                react: {
                    text: randomReaction,
                    key: {
                        remoteJid: this.targetJid,
                        fromMe: false,
                        id: randomMsgId
                    }
                }
            };

            const startTime = Date.now();
            const result = await this.sock.sendMessage(this.targetJid, reactionMessage);

            if (result?.key?.id) {
                this.recordProbeStart(result.key.id, startTime);
            }
        } catch (err) {
            logger.error(err, '[PROBE-REACTION ERROR]');
        }
    }

    private recordProbeStart(msgId: string, startTime: number) {
        this.probeStartTimes.set(msgId, startTime);

        // Set a timeout to mark as "Timeout" / Offline if no ACK received
        const timeoutId = setTimeout(() => {
            if (this.probeStartTimes.has(msgId)) {
                this.logMeasurement(msgId, null, true); // Timeout = true
                this.probeStartTimes.delete(msgId);
                this.probeTimeouts.delete(msgId);
            }
        }, 10000); 

        this.probeTimeouts.set(msgId, timeoutId);
    }

    private handleRawReceipt(node: any) {
        try {
            const { attrs } = node;
            if (attrs.type === 'inactive' && attrs.id && attrs.from) {
                const fromJid = attrs.from;
                // Basic matching
                if (fromJid.includes(this.targetJid.split('@')[0])) {
                    this.processAck(attrs.id);
                }
            }
        } catch (err) {
            // ignore
        }
    }

    private analyzeUpdate(update: { key: proto.IMessageKey, update: Partial<proto.IWebMessageInfo> }) {
        const status = update.update.status;
        const msgId = update.key.id;

        if (!msgId) return;

        // 3 = CLIENT ACK (Delivery)
        if (status === 3) {
            this.processAck(msgId);
        }
    }

    private processAck(msgId: string) {
        const startTime = this.probeStartTimes.get(msgId);
        if (startTime) {
            const rtt = Date.now() - startTime;
            
            // Clear timeout
            const timeoutId = this.probeTimeouts.get(msgId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.probeTimeouts.delete(msgId);
            }

            this.probeStartTimes.delete(msgId);
            this.logMeasurement(msgId, rtt, false);
        }
    }

    private logMeasurement(msgId: string, rtt: number | null, isTimeout: boolean) {
        const localRtt = LocalNetworkMonitor.getInstance().getCurrentRTT();
        
        // Insert into SQLite (Sync)
        try {
            stmts.insertRawMeasurement.run({
                timestamp: Date.now(),
                channel: 'whatsapp',
                target_id: this.targetJid,
                target_rtt_ms: rtt,
                timeout: isTimeout ? 1 : 0,
                local_network_rtt_ms: localRtt,
                probe_method: this.probeMethod
            });
            
            if (this.onMeasurement) {
                this.onMeasurement(this.targetJid);
            }
        } catch(e) {
            console.error('[WhatsApp] Failed to save measurement:', e);
        }
    }

    private generateRandomId() {
        const prefixes = ['3EB0', 'BAE5', 'F1D2', 'A9C4', '7E8B', 'C3F9', '2D6A'];
        const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
        return randomPrefix + randomSuffix;
    }
}
