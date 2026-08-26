# Team To-Do List — SIH26168

**Problem:** AI/ML-Based Intelligent Dead Reckoning System for Seamless Navigation
**Timeline:** 10 build days + 2 buffer days
**Demo mode:** Live sensor input (not replayed logs)

Each person owns their file. Update your own checkboxes as you go. Flag blockers in the file *and* in the group chat — don't let them sit silently.

## Owners
- [Angad](angad.md) — sensor engineering
- [Raga](raga.md) — data collection *(primary phase complete; still owns re-runs if we need more data)*
- [Palak](palak.md) — Kalman model + API + pitch + demo owner
- [Aleena](aleena.md) — backend ingestion + storage
- [Charvi](charvi.md) — frontend
- [Aarushi](aarushi.md) — documentation

## Shared blockers (unblock first, resolve as a team)
- [ ] Sensor data **ingestion schema** for Angad/Raga → Aleena handoff (wire/stream shape for live ingestion — separate from the locked CSV file-format contract)
- [ ] Backend hosting platform selection

## Non-negotiables
- [ ] Recorded video of a successful live-demo run must exist as fallback before final day
- [ ] Full pipeline (sensor → backend → frontend) tested in venue-like network conditions, not just dev machines
- [ ] Live demo rehearsed at least twice during the 2 buffer days
