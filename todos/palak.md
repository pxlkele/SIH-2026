# Palak — To-Do

**Role:** Team lead · **frontend co-owner (`web/`)** · inference-serving API · tuning · pitch narrative · **final go/no-go on demo day**

> Kalman filter *implementation* sits with Angad (see `todos/angad.md`).
> Frontend is now co-owned with Charvi (2026-09-03) — Palak building the
> infrastructure + Tier 1 feature wiring; Charvi doing visual polish, design,
> and awwwards-style feel on top. See `todos/charvi.md` for her side of the split.

## Tuning on real data
- [x] Adapter for real device logs → schema-conformant CSV — `model/adapters/ios_sensorlog.py`. **Uses iOS Core Motion (gravity-removed accel, bias-compensated gyro)** — raw sensors caused ~70 m drift on real data because gravity leaks into horizontal axes when the phone tilts.
- [x] Three real captures converted: `data/real/ios_test_2026-08-24.csv`, `ios_drive_2026-08-24.csv`, `ios_drive_2026-08-29.csv` (~2.5 min drive, 52 GPS fixes — first tuning-grade log).
- [x] First real-data drift numbers on **actual drives** (2026-09-02, ~3.2 km and ~4.7 km captures in North Bengaluru): **2.3 m and 3.0 m mean drift vs raw GPS online**; **1.7 m and 2.1 m with the RTS smoother**. Path length matches raw GPS to within 1%. Filter is production-quality on drive-scale motion.
- [x] Earlier "9.1 m" number was actually against near-stationary walking data (aug29 log), not a drive. Correctly documented in `data/README.md`.
- [x] Re-tune `accel_process_std` — swept 0.5 → 5.0; **default is now 2.0** (was 0.5, tuned for synth only). Full sweep + rationale in `model/README.md`.
- [ ] **Get a drive log that actually includes a GPS-outage segment** (tunnel, basement parking, underpass). All current logs have healthy GPS throughout, so we can't measure real dead-reckoning behaviour yet. This is the biggest gap.
- [ ] If real IMU shows visible drift beyond the outage, work with Angad to add bias state or a stationary-start calibration
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
- [x] End-to-end integration test with Charvi's frontend — no longer blocked, I own the frontend infrastructure now so this happens as a natural side-effect of building `web/`

## Frontend build (co-owned with Charvi — I'm on infrastructure)
Stack: **Vite + React + shadcn/ui + Tailwind + Mapbox GL JS + Socket.io client**, deployed to Vercel. Lives at `web/`.

### Infrastructure (mine)
- [ ] Scaffold Vite + React + Tailwind + shadcn CLI
- [ ] Router: `/` (main app) and `/demo` (pitch showcase)
- [ ] Mapbox GL map component — reusable, accepts layer configs, imperative updates (no React re-render on 30-50 Hz socket events)
- [ ] Socket.io client — reconnect handling, subscription helpers for `fused_result` / `matched_path` / `sample_rejected`
- [ ] Env config: `VITE_BACKEND_URL`, `VITE_MAPBOX_TOKEN`
- [ ] Mock-data mode: replay a saved `fused_result` stream locally so we can build UI without Aleena's server running
- [ ] Deploy skeleton to Vercel

### Feature wiring (mine, on top of the infrastructure)
- [ ] Main-app `/` — single fused path, marker with heading, confidence ellipse, DR-active badge, follow-vehicle camera
- [ ] `/demo` — split-screen raw vs Kalman, DR ON/OFF toggle, road-snapped layer, live drift HUD, RTS-smoothed playback

### Design + polish (Charvi's half)
Once the infrastructure is standing, Charvi takes over visual design — colors, typography, animations, layout, the awwwards-style feel. See `todos/charvi.md`.

## Tier 1 winner-tier features (I scoped these — coordinate the rollout)
- [ ] Kick off the four Tier 1 features with Charvi + Aleena (specs are in their todo files)
  - Road-snapped path — Aleena backend **done** (`server/mapMatch.js`); Charvi still needs to consume the `matched_path` event
  - Confidence ellipse (Charvi, using existing `std_e_m` / `std_n_m` from `fused_result`)
  - Dead-reckoning ON/OFF toggle (Charvi, pure client-side)
  - Live drift counter HUD (Charvi, using `fused_result` + raw GPS)
- [x] Extend `StepResult` with full 2×2 position covariance (`cov_ee`, `cov_en`, `cov_nn`) — unlocks Charvi's rotated ellipse. Wire-format documented in `model/README.md :: Inference API` with a JS eigendecomposition snippet. **Aleena's `modelBridge.js` needs no code change** — it forwards the whole `StepResult` object as-is to `fused_result`, so the new fields flow through automatically.
- [x] **Post-run RTS backwards smoother** (`model/smoother.py`) — a bonus depth feature: same Kalman math run forward then backward, blended optimally. **5× improvement through the synth outage (1.39 m vs 6.35 m mean)**. Spec for the split-screen + playback layer added to Charvi's todo. Backend needs a small `/session/:id/smoothed` endpoint from Aleena (spec added to her todo).
- [ ] Rehearse the pitch flow with the new visuals in place before the buffer days — the demo script may want minor updates to lean on the toggle / ellipse / smoothed-playback moments
