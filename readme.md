# Confidence-First Adaptive RTT Measurement System

> **Status:** Research / Proof-of-Concept  
> **Guarantee:** This system prefers silence over false confidence.

## Overview
This project implements a **confidence-first, adaptive RTT (Round-Trip Time) measurement system** designed to analyze *network-level responsiveness signals* derived from messaging delivery acknowledgements.

It is **not** a tracker, presence detector, or activity monitor. It exists to demonstrate how to model uncertainty, handle noisy timing side-channels, and avoid hallucinated conclusions in distributed systems.

**[Read the Design Principles](docs/DESIGN_PRINCIPLES.md)** used to ensure epistemic honesty.

## Key Features

- **Uncertainty Modeling**: Explicitly outputs "unknown" when signals are noisy or ambiguous.
- **Local Network Correction**: Continuously monitors local network conditions to normalize RTT data.
- **Adaptive Baselines**: Learns per-target latency patterns over time using exponential decay.
- **SQLite-First**: All data is persisted to an immutable, local-first SQLite database for auditability.

**[View Architecture Details](docs/ARCHITECTURE.md)**

## What This is NOT
This system **does not** attempt to:
- Infer user intent or actions.
- Detect screen lock/unlock states.
- Provide real-time presence monitoring.
- Produce surveillance-grade output.

If you are looking for a tool that tells you *when a user is online*, this project is **not** that tool. See **[Known Limitations](docs/LIMITATIONS.md)** for more.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Docker (optional, for Signal support)
- A WhatsApp account (for WhatsApp analysis)

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/KH178/Adaptive-RTT-Measurement-System-for-device-Tracking.git
    cd Adaptive-RTT-Measurement-System-for-device-Tracking
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment:
    ```bash
    cp .env.example .env
    # Edit .env and client/.env if needed
    ```

### Usage
Start the server and client:
```bash
npm run dev
```
Access the dashboard at `http://localhost:3000`.

## Documentation
- **[Architecture](docs/ARCHITECTURE.md)**: Database schema, noise modeling, and confidence gating.
- **[Validation](docs/VALIDATION.md)**: How the system self-falsifies and stops inference.


## License & Disclaimer
This project is for **research and educational purposes only**. It must not be used for surveillance or monitoring individuals.

> **A system that frequently outputs “unknown” is working correctly.**  
> A system that is always confident is lying.
