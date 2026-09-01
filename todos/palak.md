# Palak — To-Do

**Role:** Team lead · inference-serving API · **tuning on real car log** · pitch narrative · **final go/no-go on demo day**

> Kalman filter *implementation* now sits with Angad (see `todos/angad.md`).
> Palak stays close to the model via tuning + API + demo ownership.

## Tuning on real data
- [x] Adapter for real device logs → schema-conformant CSV — `model/adapters/ios_sensorlog.py` (iOS SensorLog format). First converted file lives at `data/real/ios_test_2026-08-24.csv`. Pipeline runs cleanly on it.
- [ ] **Get a longer drive log from Raga.** The 2026-08-24 capture is only 1.5 s / 45 IMU samples / 2 GPS fixes — enough to prove the ingestion path, not enough to tune.
- [ ] Once a real drive log lands: run it through the filter, check the raw-vs-corrected drift number
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

### Google Maps head-to-head (pitch anchor)
The strongest single frame in the pitch is a side-by-side against Google Maps. Google is world-class when GPS works — the story is what happens when GPS *doesn't* work.

- [ ] Frame the comparison honestly: **not** "we beat Google everywhere" — "Google is great when GPS works; when GPS fails, the blue dot freezes or jumps hundreds of metres. We keep tracking continuously."
- [ ] Concrete numbers to have on the slide:
  - Our drift through a real GPS-loss segment (lock this from Raga's log)
  - Observed Google Maps behaviour in the same segment (freeze duration, jump distance)
  - Ratio / delta between the two

### In-car vlog — airplane-mode demo
Plan: film in the car with Google Maps + our system running side by side. Put the phone in **airplane mode** to kill Google's network-based fallbacks, then drive through a tunnel / underground parking. Google freezes hard, ours keeps tracking.

Why airplane mode is a stronger cut than expected:
- GPS itself is receive-only, so it still works in airplane mode
- BUT Google Maps also uses **wifi + cell-tower positioning** as a GPS-weak fallback (this is what actually locates you in most tunnels/parking)
- AND **A-GPS assistance** (satellite ephemeris over cell) — slows first lock
- AND **map tiles** (screen goes gray without pre-downloaded offline maps)
- Cut all of that and Google Maps has nothing left when GPS fails

Practical wrinkle: **our current demo architecture streams sensor data over the network to the backend.** If the sensor phone is in airplane mode, our pipeline also breaks. Options (pick before shoot day):

- [ ] **Option A — sensor phone tethers to a second phone's hotspot.** Airplane mode stays on for cellular, wifi-only for LAN transport. Sensor data flows to laptop. Google Maps *still can't* pull tiles/assistance because the hotspot has no upstream. Cleanest.
- [ ] **Option B — record + replay.** Log sensor data during the drive, replay in-lab through backend for the vlog. Loses "live" cred but bulletproof.
- [ ] **Option C — do both.** Live shoot with Option A, backup cut from Option B in case A goes sideways.

- [ ] Test the chosen setup before the shoot day, not on the shoot day
- [ ] Screen-record Google Maps on the sensor phone during the drive so the vlog can pixel-compare positions frame by frame
- [ ] Have a physical ground-truth reference (marked cone in parking lot, known intersection) so the vlog can show "actual truth vs. Google vs. us" in the same frame

## Coordination
- [x] Sign off on the live-ingestion schema with Angad + Aleena — locked in `data_schema.md`, Aleena's backend validates against it and forwards to `serve_stdio.py`
- [ ] Sign off on backend hosting choice with Aleena (blocker) — must support WebSockets + Python subprocess; note Aleena spawns `python` not `python3`, override via `PYTHON_BIN`
- [ ] Handshake with Angad on the model API surface — he still needs to confirm he's OK with the current filter or take it over
- [ ] End-to-end integration test with Charvi's frontend once she has a map view — proves the whole live path before venue rehearsal

## Tier 1 winner-tier features (I scoped these — coordinate the rollout)
- [ ] Kick off the four Tier 1 features with Charvi + Aleena (specs are in their todo files)
  - Road-snapped path (Aleena backend endpoint + Charvi map layer)
  - Confidence ellipse (Charvi, using existing `std_e_m` / `std_n_m` from `fused_result`)
  - Dead-reckoning ON/OFF toggle (Charvi, pure client-side)
  - Live drift counter HUD (Charvi, using `fused_result` + raw GPS)
- [ ] *(Optional, upgrade for the ellipse)* Extend `StepResult` in `model/stepper.py` to include the full 2×2 position covariance sub-matrix (`cov_ee`, `cov_en`, `cov_nn`) — cheap, unlocks a properly rotated ellipse instead of axis-aligned. Requires touching `serve_stdio.py` docs and letting Aleena know she needs to pass the new fields through
- [ ] Rehearse the pitch flow with the new visuals in place before the buffer days — the demo script may want minor updates to lean on the toggle / ellipse moments
