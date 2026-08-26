# Raga — To-Do

**Role:** Data collection — car-based logging *(primary run complete)*

## Primary run — DONE
- [x] Car-based logging run captured raw IMU + GPS

## Follow-through
- [ ] Confirm the captured log conforms to `data_schema.md` (50 Hz IMU, ~1 Hz GPS, nulls on missing GPS rows, device-frame raw values)
- [ ] Deliver a canonical clean copy of the log into the repo (or agreed storage) with a short README noting: route, date, weather, any GPS-loss segments
- [ ] Flag any known bad segments so Palak's tuning doesn't over-fit to noise

## Standby
- [ ] Available for re-runs if the model tuning or demo rehearsal reveals gaps in the captured data
- [ ] On-call to help capture a fresh log at venue-like conditions if needed
