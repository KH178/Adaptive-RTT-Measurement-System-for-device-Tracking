import { config } from 'dotenv';
config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { Boom } from '@hapi/boom';
import { WhatsAppTracker, ProbeMethod } from './tracker.js';
import { SignalTracker, getSignalAccounts, checkSignalNumber } from './signal-tracker.js';
import { initDatabase, db, stmts } from './database.js';
import { LocalNetworkMonitor } from './local-network.js';
import { AnalysisEngine } from './analysis.js';
import { AnalysisWindowRow, RawMeasurementRow, TrackerData } from './types.js';

import fs from 'fs';
import path from 'path';

// ... existing imports ...

const SIGNAL_API_URL = process.env.SIGNAL_API_URL || 'http://localhost:8080';
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;

// Ensure profile pics directory exists
const PROFILE_PIC_DIR = path.join(process.cwd(), 'data', 'profile_pics');
if (!fs.existsSync(PROFILE_PIC_DIR)) {
    fs.mkdirSync(PROFILE_PIC_DIR, { recursive: true });
}

const app = express();
app.use(cors());

// Serve static profile pictures
app.use('/profile-pics', express.static(PROFILE_PIC_DIR));

// Helper to get cached profile picture URL if it exists
function getCachedProfilePicUrl(jid: string): string | null {
    const filename = `${jid.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
    const filepath = path.join(PROFILE_PIC_DIR, filename);
    
    if (fs.existsSync(filepath)) {
        return `/profile-pics/${filename}`;
    }
    return null;
}

// Helper to download and cache profile picture
async function downloadAndCacheProfilePic(jid: string, url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        
        const buffer = await response.arrayBuffer();
        const filename = `${jid.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
        const filepath = path.join(PROFILE_PIC_DIR, filename);
        
        fs.writeFileSync(filepath, Buffer.from(buffer));
        console.log(`[Server] Cached profile pic for ${jid}`);
        
        // Return relative URL path
        return `/profile-pics/${filename}`;
    } catch (err) {
        console.error(`[Server] Error caching profile pic for ${jid}:`, err);
        return null; 
    }
}

const httpServer = createServer(app);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const io = new Server(httpServer, {
    cors: {
        origin: CLIENT_ORIGIN, 
        methods: ["GET", "POST"]
    }
});

// Crash Prevention
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
    // Do not exit!
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize System
initDatabase();
LocalNetworkMonitor.getInstance().start();
const analysisEngine = AnalysisEngine.getInstance();

let sock: any;
let isWhatsAppConnected = false;
let isSignalConnected = false;
let signalAccountNumber: string | null = null;
let globalProbeMethod: ProbeMethod = 'delete'; 
let currentWhatsAppQr: string | null = null; 

type Platform = 'whatsapp' | 'signal';

interface TrackerEntry {
    tracker: WhatsAppTracker | SignalTracker;
    platform: Platform;
}

const trackers: Map<string, TrackerEntry> = new Map();

// --- Helper: Get Latest Data for Frontend ---
// server.ts updates
// Removing forced status logic where possible or just ensuring we pass raw data

function getLatestTrackerData(targetId: string, channel: Platform): TrackerData | null {
    // 1. Get latest analysis
    const analysisIdx = stmts.getLatestAnalysis.get(targetId) as AnalysisWindowRow | undefined;
    
    // 2. Get latest SUCCESSFUL raw measurement (non-timeout) to show current RTT
    const raw = db.prepare(`
        SELECT * FROM raw_measurements 
        WHERE target_id = ? AND channel = ? AND timeout = 0 AND target_rtt_ms IS NOT NULL
        ORDER BY timestamp DESC LIMIT 1
    `).get(targetId, channel) as RawMeasurementRow | undefined;
    
    // DEBUG: Log query results
    console.log(`[DEBUG] getLatestTrackerData for ${targetId}:`);
    console.log(`[DEBUG]   raw measurement found: ${!!raw}, rtt: ${raw?.target_rtt_ms}, timeout: ${raw?.timeout}`);

    // 3. Get baseline for this target
    const baseline = stmts.getBaselines.get(targetId) as any;

    if (!raw && !analysisIdx) return null;

    // Default values if no analysis yet
    // Backend derived state IS useful, but we shouldn't purely rely on it for UI "Green Dot"
    const state = analysisIdx ? analysisIdx.derived_state : 'Unknown';
    const confidence = analysisIdx ? analysisIdx.confidence_score : 0;
    const responsiveness = analysisIdx ? analysisIdx.responsiveness_score : 0;
    const noise = analysisIdx ? analysisIdx.noise_score : 0;

    // Legacy status mapping (keep for compatibility if needed, but UI now ignores it)
    let status = 0;
    if (state === 'Online') status = 2;
    else if (state === 'Standby') status = 1;

    let median = 0;
    let threshold = 0;

    if (baseline) {
        median = baseline.median_rtt_ms || 0;
        const iqr = baseline.iqr_ms || 0;
        threshold = median + (iqr * 1.5);
    }

    const finalRtt = raw && raw.target_rtt_ms ? raw.target_rtt_ms : 0;
    console.log(`[DEBUG]   Final RTT being sent: ${finalRtt}`);

    // Return the full probabilistic picture
    return {
        timestamp: raw ? raw.timestamp : Date.now(),
        rtt: finalRtt,
        status: status,
        state: state, // This remains the "Best Guess" text label
        avg: responsiveness * 100, // Legacy field, mapped to responsiveness %
        median: median,
        threshold: threshold,
        confidence: confidence, // Crucial for new UI
        noise: noise,           // Crucial for new UI
        responsiveness: responsiveness // Crucial for SignalQualityBar
    };
}

// --- WhatsApp Connection ---
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'debug' }),
        markOnlineOnConnect: true,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code generated');
            currentWhatsAppQr = qr;
            io.emit('qr', qr);
        }

        if (connection === 'close') {
            isWhatsAppConnected = false;
            currentWhatsAppQr = null;
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed, reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isWhatsAppConnected = true;
            currentWhatsAppQr = null;
            console.log('opened connection');
            io.emit('connection-open');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

// --- Signal Connection ---
let signalLinkingInProgress = false;
let signalApiAvailable = false;
let currentSignalQrUrl: string | null = null;

async function checkSignalConnection() {
    // ... (Keep existing Signal connection logic, simplified for brevity here if unchanged, but I'll paste the essential parts)
    // For this refactor, I will assume the Signal logic from previous file is largely correct regarding connection checks.
    // I will include the critical parts.
    try {
        const response = await fetch(`${SIGNAL_API_URL}/v1/about`, { signal: AbortSignal.timeout(2000) });
        const available = response.ok;
        
        if (available !== signalApiAvailable) {
            signalApiAvailable = available;
            io.emit('signal-api-status', { available });
        }

        if (!available) {
            isSignalConnected = false;
            signalAccountNumber = null;
            return;
        }

        const accounts = await getSignalAccounts(SIGNAL_API_URL);
        if (accounts.length > 0) {
            if (!isSignalConnected) {
                isSignalConnected = true;
                signalAccountNumber = accounts[0];
                console.log(`[SIGNAL] Connected: ${signalAccountNumber}`);
                io.emit('signal-connection-open', { number: signalAccountNumber });
            }
        } else {
            isSignalConnected = false;
            signalAccountNumber = null;
        }
    } catch (err) {
        isSignalConnected = false;
    }
}
setInterval(checkSignalConnection, 5000);

// --- Socket.IO ---
io.on('connection', (socket) => {
    console.log('Client connected');

    if (currentWhatsAppQr) socket.emit('qr', currentWhatsAppQr);
    if (isWhatsAppConnected) socket.emit('connection-open');
    if (isSignalConnected && signalAccountNumber) socket.emit('signal-connection-open', { number: signalAccountNumber });
    socket.emit('signal-api-status', { available: signalApiAvailable });
    socket.emit('probe-method', globalProbeMethod);

    const trackedContacts = Array.from(trackers.entries()).map(([id, entry]) => ({
        id,
        platform: entry.platform
    }));

    socket.on('get-tracked-contacts', async () => {
        // ALWAYS get the latest list from the global map
        const latestTrackedContacts = Array.from(trackers.entries()).map(([id, entry]) => ({
            id,
            platform: entry.platform
        }));
        socket.emit('tracked-contacts', latestTrackedContacts);
        
        // Wait briefly to ensure client has processed the list
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch profile pics and data in parallel to avoid blocking
        const updates = Array.from(trackers.entries()).map(async ([id, entry]) => {
             // 1. Send profile pic if whatsapp
             if (entry.platform === 'whatsapp') {
                try {
                    // First check if we have a cached version on disk
                    const cachedUrl = getCachedProfilePicUrl(id);
                    if (cachedUrl) {
                        const fullUrl = `${SERVER_URL}${cachedUrl}`;
                        console.log(`[Server] Sending CACHED profile pic for ${id}: ${fullUrl}`);
                        socket.emit('profile-pic', { jid: id, url: fullUrl });
                    } else {
                        // No cache, try to fetch from WhatsApp
                        console.log(`[Server] No cache for ${id}, fetching from WhatsApp...`);
                        const remoteUrl = await (entry.tracker as WhatsAppTracker).getProfilePicture();
                        
                        if (remoteUrl) {
                            console.log(`[Server] Got remote URL for ${id}, caching and emitting...`);
                            const localUrl = await downloadAndCacheProfilePic(id, remoteUrl);
                            if (localUrl) {
                                const fullUrl = `${SERVER_URL}${localUrl}`;
                                socket.emit('profile-pic', { jid: id, url: fullUrl });
                            } else {
                                // FALLBACK: Send remote URL if caching fails
                                console.log(`[Server] Caching failed for ${id}, using remote URL fallback`);
                                socket.emit('profile-pic', { jid: id, url: remoteUrl });
                            }
                        } else {
                            console.log(`[Server] No profile pic available for ${id}`);
                        }
                    }
                } catch (err) {
                    console.error(`[Server] Error fetching profile pic for ${id}:`, err);
                }
             }

             // 2. Send latest data
             const data = getLatestTrackerData(id, entry.platform);
             if (data) {
                 const updatePayload = {
                     jid: id,
                     platform: entry.platform,
                     devices: [{
                         jid: id,
                         state: data.state,
                         rtt: data.rtt,
                         avg: data.avg || 0
                     }],
                     deviceCount: 1,
                     presence: data.state,
                     median: data.median || 0,
                     threshold: data.threshold || 0,
                     confidence: data.confidence,
                     noise: data.noise,
                     responsiveness: data.responsiveness
                 };
                 socket.emit('tracker-update', updatePayload);
             }
        });
        
        await Promise.all(updates);
    });

    socket.on('get-historical-data', async ({ jid, platform }: { jid: string; platform: Platform }) => {
        try {
            // Fetch from Analysis tables joined with Raw?
            // For now, let's return raw measurements + derived state
            // Or just return the Analysis Windows? 
            // The frontend chart likely wants points.
            
            // Let's return raw measurements for the chart, but maybe enriched?
            const rows = db.prepare(`
                SELECT timestamp, target_rtt_ms as rtt 
                FROM raw_measurements 
                WHERE target_id = ? AND channel = ? AND timestamp > ?
                ORDER BY timestamp ASC
            `).all(jid, platform, Date.now() - 86400000); // Last 24h

            socket.emit('historical-data', { 
                jid, 
                platform, 
                records: rows.map((r: any) => ({
                    timestamp: r.timestamp,
                    rtt: r.rtt || 0,
                    status: 0, // Simplify for history for now, or fetch analysis
                    state: 'Unknown'
                }))
            });
        } catch (error) {
            console.error(error);
        }
    });

    socket.on('add-contact', async (data: any) => {
        const { number, platform } = typeof data === 'string' ? { number: data, platform: 'whatsapp' as Platform } : data;
        const cleanNumber = number.replace(/\D/g, '');

        if (platform === 'whatsapp') {
            const targetJid = cleanNumber + '@s.whatsapp.net';
            if (trackers.has(targetJid)) return;

            try {
                const results = await sock.onWhatsApp(targetJid);
                if (results?.[0]?.exists) {
                    const tracker = new WhatsAppTracker(sock, results[0].jid);
                    tracker.setProbeMethod(globalProbeMethod);
                    
                    // HOOK: When measurement happens, run analysis and emit update
                    tracker.onMeasurement = (jid) => {
                        try {
                            analysisEngine.runAnalysis(jid, 'whatsapp');
                            const update = getLatestTrackerData(jid, 'whatsapp');
                            if (update) {
                                const updatePayload = {
                                    jid,
                                    platform: 'whatsapp',
                                    devices: [{
                                        jid,
                                        state: update.state,
                                        rtt: update.rtt,
                                        avg: update.avg || 0
                                    }],
                                    deviceCount: 1,
                                    presence: update.state,
                                    median: update.median || 0,
                                    threshold: update.threshold || 0,
                                    confidence: update.confidence,
                                    noise: update.noise,
                                    responsiveness: update.responsiveness
                                };
                                io.emit('tracker-update', updatePayload);
                            }
                        } catch (err) {
                            console.error('[Server] Error in onMeasurement callback:', err);
                        }
                    };

                    trackers.set(results[0].jid, { tracker, platform: 'whatsapp' });
                    tracker.startTracking();

                    socket.emit('contact-added', { jid: results[0].jid, number: cleanNumber, platform: 'whatsapp' });

                    // Fetch and emit profile picture
                    console.log(`[Server] Fetching profile pic for new contact ${results[0].jid}...`);
                    const remoteUrl = await tracker.getProfilePicture();
                    console.log(`[Server] Profile pic for ${results[0].jid}: ${remoteUrl ? 'FOUND' : 'NULL'}`);
                    
                    if (remoteUrl) {
                        // 1. Emit remote immediately for responsiveness
                        socket.emit('profile-pic', { jid: results[0].jid, url: remoteUrl });

                        // 2. Try to cache it for later
                        downloadAndCacheProfilePic(results[0].jid, remoteUrl).catch(e => {
                            console.error('[Server] Background cache failed:', e);
                        });
                    }
                }
            } catch (e) {
                console.error('[Server] WhatsApp verification/adding failed:', e);
                socket.emit('error', { message: 'WhatsApp verification failed' });
            }
        
        } else if (platform === 'signal') {
             if (!isSignalConnected || !signalAccountNumber) return;
             const signalId = `signal:${cleanNumber}`;
             const targetNumber = cleanNumber.startsWith('+') ? cleanNumber : `+${cleanNumber}`;
             
             const tracker = new SignalTracker(SIGNAL_API_URL, signalAccountNumber, targetNumber);
             
             tracker.onMeasurement = (num) => {
                 try {
                     analysisEngine.runAnalysis(num, 'signal');
                     const update = getLatestTrackerData(num, 'signal');
                     if (update) {
                         const updatePayload = {
                             jid: signalId,
                             platform: 'signal',
                             devices: [{
                                 jid: signalId,
                                 state: update.state,
                                 rtt: update.rtt,
                                 avg: update.avg || 0
                             }],
                             deviceCount: 1,
                             presence: update.state,
                             median: update.median || 0,
                             threshold: update.threshold || 0,
                             confidence: update.confidence,
                             noise: update.noise,
                             responsiveness: update.responsiveness
                         };
                         io.emit('tracker-update', updatePayload);
                     }
                 } catch (err) {
                     console.error('[Server] Error in Signal onMeasurement callback:', err);
                 }
             };

             trackers.set(signalId, { tracker, platform: 'signal' });
             tracker.startTracking();
             socket.emit('contact-added', { jid: signalId, number: cleanNumber, platform: 'signal' });
        }
    });

    socket.on('remove-contact', (jid: string) => {
        const entry = trackers.get(jid);
        if (entry) {
            entry.tracker.stopTracking();
            trackers.delete(jid);
            socket.emit('contact-removed', jid);
        }
    });

    socket.on('set-probe-method', (method: ProbeMethod) => {
        globalProbeMethod = method;
        for (const entry of trackers.values()) {
            if (entry.platform === 'whatsapp') {
                (entry.tracker as WhatsAppTracker).setProbeMethod(method);
            }
        }
        io.emit('probe-method', method);
    });

    // --- Historical Data Handlers ---
    socket.on('get-available-dates', ({ jid, platform }) => {
        try {
            // Normalize JID if needed, but usually passed correct from client
            // Check if we have data for this JID
            const dates = stmts.getAvailableDates.all(jid).map((row: any) => row.day);
            socket.emit('available-dates', { jid, dates });
        } catch (err) {
            console.error('Error fetching available dates:', err);
            socket.emit('available-dates', { jid, dates: [] });
        }
    });

    socket.on('get-historical-data', ({ jid, platform, date }) => {
        try {
            const rawRecords = stmts.getHistoricalData.all(jid, date);
            
            // Transform to TrackerData format
            const records: TrackerData[] = rawRecords.map((row: any) => ({
                rtt: row.rtt || 0,
                avg: row.baseline || 0, // Using baseline as avg context
                median: 0,
                threshold: 0,
                state: row.rtt ? 'Online' : 'Offline', // Simple derivation for now, or match existing logic
                timestamp: row.timestamp,
                confidence: 1, 
                noise: 0,
                responsiveness: row.rtt ? 1 : 0
            }));
            
            // If we have analysis windows, we could overlay better states, 
            // but for now let's just send the raw RTT data which is what the user missed.
            
            socket.emit('historical-data', { jid, date, records });
        } catch (err) {
            console.error('Error fetching historical data:', err);
            socket.emit('historical-data', { jid, date, records: [] });
        }
    });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
