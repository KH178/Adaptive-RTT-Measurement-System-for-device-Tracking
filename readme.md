# Confidence‑First Adaptive RTT Measurement System

> **Status:** Research / Proof‑of‑Concept  
> **Audience:** Engineers, security researchers, systems designers  
> **Guarantee:** This system prefers silence over false confidence.

---

## Overview

This project implements a **confidence‑first, adaptive RTT (Round‑Trip Time) measurement system** designed to analyze *network‑level responsiveness signals* derived from messaging delivery acknowledgements.

It is intentionally **not** a tracker, presence detector, or activity monitor.

The system exists to demonstrate **how weak, noisy timing side‑channels behave in real‑world conditions**, and how to design software that:

- models its **own uncertainty**
- explicitly accounts for **local network influence**
- avoids hallucinated or misleading conclusions

If you are looking for a tool that tells you *when a user is online, active, locked, or asleep*, this project is **not** that tool.

---

## Non‑Goals (Very Important)

This system **does not** attempt to:

- infer user intent or actions
- detect screen lock / unlock
- provide real‑time presence
- determine exact activity timestamps
- produce surveillance‑grade output

Any attempt to retrofit these goals will break the design guarantees.

---

## Core Design Principles

1. **Raw data is sacred** – never overwritten or “corrected”
2. **Uncertainty is a first‑class output**
3. **Silence is preferable to false confidence**
4. **Local network effects must be modeled explicitly**
5. **All inference is probabilistic, never categorical**
6. **The system must be allowed to say “unknown”**

If any of these rules are violated, the system will hallucinate.

---

## High‑Level Architecture

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
  ├─ Confidence‑gated views
  ├─ No forced states
```

---

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

---

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
- Historical data must always be re‑processable

---

## Required Refactor Notes (Important)

### Why Refactoring Is Mandatory

The current implementation (file-based JSON + in-memory aggregation) **cannot support**:

- retrospective re-analysis
- confidence downgrades
- baseline re-learning
- network-aware correction

To meet the guarantees described in this README, a **non-trivial refactor is required**.

---

### Refactor Scope

The following changes are required:

1. **Replace JSON storage entirely** with SQLite writes
2. **Decouple measurement from inference** (no live labeling)
3. **Move aggregation logic out of the probe loop**
4. **Introduce read-only raw tables + derived views**
5. **Allow full historical reprocessing** on every analysis run

---

### Minimal Required Tables

```sql
raw_measurements        -- immutable ground truth
local_network_metrics   -- control signal
baselines               -- learned, slow-moving stats
analysis_windows        -- derived, confidence-weighted outputs
```

---

### Architectural Constraint

> Measurement code must never depend on inference code.

If inference crashes, measurement **must continue safely**.

---

## Measurement Layer

### Target Signal

- Measures delivery acknowledgement latency
- Observes **timing only**, never content
- Makes no assumption of 1:1 ACK behavior

### Local Network Control Signal

Continuously measures local network health to estimate:

- baseline RTT
- variance and jitter
- burstiness
- packet loss proxies

This signal is **mandatory** and used to gate inference.

---

## Baseline Modeling

### Per‑Target Baseline

Each target maintains its own adaptive baseline:

- rolling median RTT
- interquartile range (IQR)
- timeout rate
- time‑of‑day variance

### Update Strategy

- exponential decay
- resistant to short‑term spikes
- slow adaptation to long‑term drift

Baselines must converge before inference is allowed.

---

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

This rule is non‑negotiable.

---

## RTT Normalization

Raw RTT is never used directly for inference.

Instead:

```
normalized_rtt = target_rtt − local_network_baseline
```

This removes first‑order local network effects and allows **relative** comparison only.

---

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

---

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

---

## Retrospective Auto‑Correction

When:

- baselines shift
- network conditions are re‑evaluated
- noise models improve

The system:

- re‑analyzes historical raw data
- downgrades confidence where necessary
- withdraws conclusions when assumptions fail

Auto‑correction **reduces confidence**, it does not fabricate accuracy.

---

## Visualization Requirements

### Mandatory Layers

1. raw RTT (always visible)
2. local network RTT
3. normalized RTT with IQR bands
4. confidence overlay
5. explicit “inference disabled” regions

### Forbidden Visuals

- Online / Standby / Offline timelines
- hard state transitions
- user‑intent labels

If the graph looks “clean”, it is lying.

---

## Validation & Falsification

The system **must** support:

- target RTT vs local RTT correlation tests
- variance dominance checks
- lag analysis
- controlled low‑noise windows

Failure of any test disables inference.

---

## Stop Conditions (Abort Criteria)

Inference is permanently disabled if:

- local network variance ≈ target variance
- confidence remains low over extended periods
- baselines fail to converge
- responsiveness oscillates excessively

Silence is the correct output.

---

## Known Limitations

This system **cannot**:

- detect screen state
- infer user actions
- provide real‑time presence
- separate OS wake from network wake
- achieve deterministic accuracy

These are physical and architectural limits.

---

## Definition of Success

Success means:

- accurately identifying **when inference is invalid**
- honest reporting of uncertainty
- absence of false precision
- reproducible, defensible results

Failure means confident output under high noise.

---

## Final Note

This project **intentionally prioritizes correctness over convenience**.

Migrating to SQLite and refactoring the pipeline is not optional — it is the **price of epistemic honesty**.

> A system that cannot reprocess its past is guaranteed to lie about it.

---

## License & Usage Disclaimer

This project is provided for **research and educational purposes only**.

It must not be used for surveillance, monitoring individuals, or drawing behavioral conclusions about real users.

Any such use violates the design intent of this system.


> **A system that frequently outputs “unknown” is working correctly.**  
> A system that is always confident is lying.

If you build on this project, respect that principle.

