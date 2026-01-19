# Validation & Falsification
The system **must** support:
- target RTT vs local RTT correlation tests
- variance dominance checks
- lag analysis
- controlled low-noise windows

Failure of any test disables inference.

## Stop Conditions (Abort Criteria)
Inference is permanently disabled if:
- local network variance ≈ target variance
- confidence remains low over extended periods
- baselines fail to converge
- responsiveness oscillates excessively

Silence is the correct output.

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

## Visualization Requirements
### Mandatory Layers
1. raw RTT (always visible)
2. local network RTT
3. normalized RTT with IQR bands
4. confidence overlay
5. explicit “inference disabled” regions


If the graph looks “clean”, it is lying.
