# Architecture & Implementation Details

## Data Storage & Data Model

### Database Choice (Mandatory)
This system **must use SQLite as the sole persistence layer** for all raw measurements and derived artifacts.

SQLite is chosen deliberately because:
- it is **local-first** and deterministic
- it avoids network-induced write noise
- it supports strong consistency without infrastructure
- it enables retrospective re-processing with SQL
- it keeps the system debuggable and auditable

Any file-based JSON storage or append-only logs are **explicitly deprecated** and considered a prototype-only artifact.

## Data Model

### Raw Measurement Record (SQLite Schema)
```sql
CREATE TABLE raw_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  channel TEXT NOT NULL,
  target_rtt_ms INTEGER,
  timeout BOOLEAN NOT NULL,
  local_network_rtt_ms INTEGER,
  probe_id TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_raw_timestamp ON raw_measurements(timestamp);
CREATE INDEX idx_raw_channel ON raw_measurements(channel);
```

### Data Rules
- All raw measurements are written **only once** (append-only)
- No UPDATE or DELETE operations are allowed on raw tables
- Any correction or re-interpretation happens in **derived tables or views**
- SQLite is the system of record; in-memory state is disposable

- Raw RTT values are never modified
- Timeouts are explicit, not inferred
- Derived metrics are stored separately
- Historical data must always be re-processable

## High-Level Architecture
```
Measurement Layer
  ├─ Target RTT probes
  ├─ Local network probes (control)
  │
  ▼
Raw Data Store (immutable)
  │
  ▼
Analysis Engine
  ├─ Baseline learning
  ├─ Noise estimation
  ├─ RTT normalization
  ├─ Confidence modeling
  │
  ▼
Visualization & Reporting
  ├─ Confidence-gated views
  ├─ No forced states
```

### Architectural Constraint
> Measurement code must never depend on inference code.

If inference crashes, measurement **must continue safely**.

## Baseline Modeling

### Per-Target Baseline
Each target maintains its own adaptive baseline:
- rolling median RTT
- interquartile range (IQR)
- timeout rate
- time-of-day variance

### Update Strategy
- exponential decay
- resistant to short-term spikes
- slow adaptation to long-term drift

Baselines must converge before inference is allowed.

## Noise Modeling
Each time window is assigned a **noise score**:
```
noise ∈ [0, 1]
```
Derived from:
- RTT variance
- burst frequency
- timeout clustering
- local network instability

### Gating Rule
If noise exceeds threshold:
```
inference disabled
confidence = 0
```
This rule is non-negotiable.

## RTT Normalization
Raw RTT is never used directly for inference.
Instead:
```
normalized_rtt = target_rtt − local_network_baseline
```
This removes first-order local network effects and allows **relative** comparison only.

## Responsiveness Model

### Continuous Metric
Instead of discrete states, the system computes:
```
responsiveness ∈ [0, 1]
```
- `1.0` → highly responsive
- `0.0` → unreachable

### Temporal Inertia
- single samples have minimal impact
- sustained evidence required for change
- prevents oscillation and hallucination

## Confidence Estimation
Every output includes a confidence score based on:
- sample density
- noise level
- baseline stability
- agreement with historical patterns
- local network health

### Confidence Rule
If confidence falls below threshold:
```
output = "unknown"
```
No fallback labels are allowed.

## Retrospective Auto-Correction
When:
- baselines shift
- network conditions are re-evaluated
- noise models improve

The system:
- re-analyzes historical raw data
- downgrades confidence where necessary
- withdraws conclusions when assumptions fail

Auto-correction **reduces confidence**, it does not fabricate accuracy.
