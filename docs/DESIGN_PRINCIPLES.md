# Core Design Principles

1. **Raw data is sacred** – never overwritten or “corrected”
2. **Uncertainty is a first-class output**
3. **Silence is preferable to false confidence**
4. **Local network effects must be modeled explicitly**
5. **All inference is probabilistic, never categorical**
6. **The system must be allowed to say “unknown”**

If any of these rules are violated, the system will hallucinate.

## Definition of Success

Success means:
- accurately identifying **when inference is invalid**
- honest reporting of uncertainty
- absence of false precision
- reproducible, defensible results

Failure means confident output under high noise.

## Final Note
This project **intentionally prioritizes correctness over convenience**.

Migrating to SQLite and refactoring the pipeline is not optional — it is the **price of epistemic honesty**.

> A system that cannot reprocess its past is guaranteed to lie about it.
> **A system that frequently outputs “unknown” is working correctly.**
> A system that is always confident is lying.
