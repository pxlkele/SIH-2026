# Raga — To-Do

**Role:** Data collection — car-based logging

> **Status correction (2026-09-02):** the "primary run complete" claim from
> the original brief has not landed in the repo. Zero commits from Raga; no
> drive logs in `data/real/`. All current test data is Palak walking around
> MAHE campus with SensorLog. **The model has never been tuned or
> validated against a real drive.** Getting one is the #1 project-blocker.

## Primary capture — DO THIS FIRST
- [ ] Install **SensorLog** on iPhone (App Store, free)
- [ ] Enable in settings: Location, Accelerometer, Gyro, DeviceMotion; sample rate at ~50 Hz IMU, GPS at max rate
- [ ] Mount phone flat in car dashboard mount
- [ ] Record **5-10 minutes of city driving** — normal turns/stops/straights
- [ ] **Must include at least one GPS-loss segment**: an underpass, basement parking, or tunnel. Options in Bengaluru: Cubbon Park underpass, any metro-station parking, mall basement.
- [ ] Airdrop the CSV to Palak OR upload to shared drive. Filename will be like `2026-MM-DD_HH_mm_ss_my_iOS_device.csv`.
- [ ] Note the route, time, weather, and where the GPS-loss segment starts/ends

## Follow-through (once primary capture lands)
- [ ] Confirm the SensorLog CSV includes the fields the adapter expects (see `model/adapters/ios_sensorlog.py`)
- [ ] Palak converts via the adapter → `data/real/*.csv`; if any conversion warnings, work with Palak to fix
- [ ] Second capture: same route (or similar), for reproducibility during demo rehearsal

## Standby
- [ ] Available for re-runs if the model tuning or demo rehearsal reveals gaps
- [ ] On-call to help capture a fresh log at venue-like conditions if needed
