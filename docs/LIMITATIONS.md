# Known Limitations

This system **cannot**:
- detect screen state
- infer user actions
- provide real-time presence
- separate OS wake from network wake
- achieve deterministic accuracy

These are physical and architectural limits.

## Non-Goals (Very Important)
This system **does not** attempt to:
- infer user intent or actions
- detect screen lock / unlock
- provide real-time presence
- determine exact activity timestamps
- produce surveillance-grade output

Any attempt to retrofit these goals will break the design guarantees.
If you are looking for a tool that tells you *when a user is online, active, locked, or asleep*, this project is **not** that tool.
