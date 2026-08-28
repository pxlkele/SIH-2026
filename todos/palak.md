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
- [x] Define request/response schema for a single fusion step — documented in `model/README.md :: Inference API`
- [x] Wrap Angad's filter as a **streaming stepper** — `model/stepper.py :: SessionStepper`
- [x] Warm-start / state persistence between samples in the same session — subprocess-per-session holds state naturally
- [x] Streaming endpoint / process shape compatible with Aleena's WebSocket path — `model/serve_stdio.py`; Aleena's `server/modelBridge.js` wires it end-to-end, smoke test proves parity with batch to <1e-9°

## Pitch narrative + demo ownership
- [ ] Lock the story: problem → why classical Kalman → the "wow" moment (raw-GPS path vs. corrected path on the map)
- [ ] Rehearse pitch to fit judging time slot
- [ ] Own the **live-demo go/no-go call** on demo day
- [ ] Ensure fallback video exists and is queued before we walk in

## Coordination
- [x] Sign off on the live-ingestion schema with Angad + Aleena — locked in `data_schema.md`, Aleena's backend validates against it and forwards to `serve_stdio.py`
- [ ] Sign off on backend hosting choice with Aleena (blocker) — must support WebSockets + Python subprocess; note Aleena spawns `python` not `python3`, override via `PYTHON_BIN`
- [ ] Handshake with Angad on the model API surface — he still needs to confirm he's OK with the current filter or take it over
- [ ] End-to-end integration test with Charvi's frontend once she has a map view — proves the whole live path before venue rehearsal
