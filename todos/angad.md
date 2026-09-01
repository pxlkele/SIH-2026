# Angad — To-Do

**Role:** Sensor engineering — IMU/GPS instrumentation · **Kalman filter (state-space fusion)** · hardware-side fusion

> A first-cut linear Kalman filter is already in `model/` (state `[E, N, vE, vN]`,
> IMU-as-control, GPS measurement update). Palak scaffolded it to unblock the
> pipeline. Take it over, refactor / rewrite as you see fit, and own the filter
> going forward. Palak still owns tuning + the inference API on top.

## Kalman filter (state-space fusion)
- [x]Review the first-cut filter in model/kalman.py + model/frames.py — keep, rewrite, or replace
      note: both are good, keeping them. KF equations and ENU conversion look fine, no point rewriting before hackathon
- [x] Confirm the design assumptions in model/README.md are what you want
      Local ENU tangent plane
      State [E, N, vE, vN], IMU as control input
      Yaw-only heading from gyro_z (level-vehicle assumption)
      No IMU bias state (yet)
  note: confirmed, all good for the current demo. yaw-only means sensor needs to stay roughly level
- [x] Decide if you want to promote to an EKF or add bias state — trade timeline vs. real-log drift
      note: staying with linear KF for saturday. EKF is unnecessary rn and adds risk. only add simple bias correction if real logs show bad drift
- [x] Expose a clean `step(sample) -> position` interface so Palak's inference API can wrap it
      note: already exists through SessionStepper.step(), so no need to make another interface. input/output format is already mostly set
- [x] Sanity-check numbers on `model/synth/synth_log.csv` still hold after your changes
  (current: 1.5 m mean err through the 20s GPS-loss window)
  note: checked, result still holds at around 1.5 m mean error during the 20 sec GPS loss. synthetic test is clean though so real car performance can be worse

## Instrumentation
- [x] Confirm IMU sample rate holds steady at 50 Hz under load
      note: 50 Hz confirmed / ~20 ms between samples
- [x] Confirm GPS delivers ~1 Hz with fix quality logged (accuracy/HDOP or equivalent)
      note: ~1 Hz confirmed and gps_accuracy_m is included in the schema
- [x] Timestamp alignment between IMU and GPS streams — single monotonic clock source
      note: timestamp format/schema confirmed. using timestamp_ms; need to make sure live data doesnt send old/out-of-order timestamps
- [x] Verify raw device-frame output matches the locked `data_schema.md` field-for-field
      note: schema matches the model input — accel in m/s2, gyro in rad/s, GPS nullable. no forward filling GPS

## Hardware-side fusion / live path
- [ ] Wire sensor output to the live-ingestion transport (WebSocket) chosen with Aleena
- [ ] Handshake / reconnect behavior for the demo (wifi at the venue is unreliable)
- [ ] GPS-loss simulation trigger for the demo scenario (physical or software)

## Venue-readiness
- [ ] Sensor rig runs off battery for the length of the demo slot + rehearsal
- [ ] Spare cables / dongles / mount / backup device
- [ ] Test full sensor → backend → frontend loop in venue-like network conditions (not just dev machine)

## Coordination
- [ ] Agree on live-ingestion schema with Palak + Aleena (blocker)
- [ ] Handshake with Palak on the model API surface (what `step(sample) -> position` looks like)
