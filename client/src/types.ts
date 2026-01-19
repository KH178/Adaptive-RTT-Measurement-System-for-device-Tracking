// client/src/types.ts

export type TrackerState = 'Online' | 'Standby' | 'OFFLINE' | 'Calibrating...';

export interface TrackerData {
    rtt: number;
    avg?: number;
    median?: number;
    threshold?: number;
    state: TrackerState | string;
    timestamp: number;
    confidence?: number;
    noise?: number;
    responsiveness?: number;
}

export interface DeviceInfo {
    jid: string;
    state: TrackerState | string;
    rtt: number;
    avg: number;
}

export type Platform = 'whatsapp' | 'signal';

export interface TrackerUpdate {
    jid: string;
    platform: Platform;
    devices: DeviceInfo[];
    deviceCount: number;
    presence: string | null;
    median: number;
    threshold: number;
    confidence?: number;
    noise?: number;
    responsiveness?: number;
}
