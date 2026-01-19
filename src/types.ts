// Core state definitions
export type TrackerState = 'Online' | 'Standby' | 'OFFLINE' | 'Unknown' | 'Calibrating...';

// API Response type (Frontend Compatibility)
export interface TrackerData {
    timestamp: number;
    rtt: number;           // Raw RTT (or last known)
    status: number;        // 2=Online, 1=Standby, 0=Offline/Unknown
    state: TrackerState;   // Text representation
    
    // Analysis metrics
    avg?: number;          // Moving average (deprecated in favor of more robust stats, but kept for UI)
    median?: number;       // Baseline median
    threshold?: number;    // Baseline threshold
    
    // New fields
    confidence?: number;   // 0.0 - 1.0 (New!)
    noise?: number;        // 0.0 - 1.0 (New!)
    responsiveness?: number; // 0.0 - 1.0 (New!)
}

// Database Row Types (for better typing in code)

export interface RawMeasurementRow {
    id: number;
    timestamp: number;
    channel: 'whatsapp' | 'signal';
    target_id: string;
    target_rtt_ms: number | null;
    timeout: number; // SQLite uses 0/1 for boolean
    local_network_rtt_ms: number | null;
    probe_method: string;
    created_at: number;
}

export interface LocalNetworkMetricRow {
    id: number;
    timestamp: number;
    rtt_ms: number | null;
    timeout: number;
    variance_ms: number | null; 
    packet_loss_rate: number | null;
    reference_target: string;
}

export interface AnalysisWindowRow {
    id: number;
    start_timestamp: number;
    end_timestamp: number;
    target_id: string;
    channel: 'whatsapp' | 'signal';
    sample_count: number;
    noise_score: number;
    responsiveness_score: number;
    confidence_score: number;
    derived_state: TrackerState;
    created_at: number;
}