# Palak — To-Do

**Role:** Team lead · inference-serving API · **tuning on real car log** · pitch narrative · **final go/no-go on demo day**

> Kalman filter *implementation* now sits with Angad (see `todos/angad.md`).
> Palak stays close to the model via tuning + API + demo ownership.

## Tuning on real data
- [ ] When Raga's real car log lands in the repo, run it through the filter and check the raw-vs-corrected drift number
- [ ] Re-tune `accel_process_std` (and `min_gps_std_m` if needed) — see `model/README.md :: Tuning knobs`
- [ ] If real IMU shows visible drift, work with Angad to add bias state or a stationary-start calibration
- [ ] Reference IMU datasets (RIDI / RoNIN) if extra tuning data is needed
- [ ] Lock a headline demo-day number: mean drift through a real GPS-loss segment

## Inference-serving API
- [ ] Define request/response schema for a single fusion step (input: IMU+GPS sample; output: corrected position + covariance)
- [ ] Wrap Angad's filter as a **streaming stepper** so it can be driven one sample at a time (not just batch over a log)
- [ ] Warm-start / state persistence between samples in the same session (session ID)
- [ ] Streaming endpoint / process shape compatible with Aleena's WebSocket path (Node subprocess per the chosen stack)

## Pitch narrative + demo ownership
- [ ] Lock the story: problem → why classical Kalman → the "wow" moment (raw-GPS path vs. corrected path on the map)
- [ ] Rehearse pitch to fit judging time slot
- [ ] Own the **live-demo go/no-go call** on demo day
- [ ] Ensure fallback video exists and is queued before we walk in

## Coordination
- [ ] Sign off on the live-ingestion schema with Angad + Aleena (blocker)
- [ ] Sign off on backend hosting choice with Aleena (blocker)
- [ ] Handshake with Angad on the model API surface (what `step(sample) -> position` looks like)
