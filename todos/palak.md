# Palak — To-Do

**Role:** Team lead · **product owner (`web/`)** · Kalman tuning + ML classifier · pitch narrative · **final go/no-go on demo day**

> Kalman filter *implementation* sits with Angad (see `todos/angad.md`).
> **App/website scope revised again (2026-09-04):** the whole interactive
> product surface — Loader, Home, /app, /demo — is Palak's, deployed at
> **https://beacon-sih.vercel.app**. Charvi's remaining lane is optional
> visual polish + brand iteration on top of what's shipped.

## Tuning on real data
- [x] Adapter for real device logs → schema-conformant CSV — `model/adapters/ios_sensorlog.py`. **Uses iOS Core Motion (gravity-removed accel, bias-compensated gyro)** — raw sensors caused ~70 m drift on real data because gravity leaks into horizontal axes when the phone tilts.
- [x] Five real captures converted to `data/real/*.csv`.
- [x] First real-data drift numbers on **actual drives** (2026-09-02, ~3.2 km and ~4.7 km captures in North Bengaluru): **2.3 m and 3.0 m mean drift vs raw GPS online**; **1.7 m and 2.1 m with the RTS smoother**. Path length matches raw GPS to within 1%.
- [x] Re-tune `accel_process_std` — swept 0.5 → 5.0; **default is now 2.0**. Full sweep + rationale in `model/README.md`.
- [ ] **Get a drive log that actually includes a GPS-outage segment** (tunnel, basement parking, underpass). All current logs have healthy GPS throughout, so we can't measure real dead-reckoning behaviour yet. **Biggest data gap.**
- [ ] If real IMU shows visible drift beyond the outage, work with Angad to add bias state or a stationary-start calibration
- [ ] Lock a headline demo-day number: mean drift through a real GPS-loss segment

## AI/ML — motion-mode classifier (rubric win)
- [x] Trained a multinomial logistic regression on our 5 real captures — walking / driving / stationary. Pure numpy trainer at `model/motion_classifier/train.py`, weights exported to `web/public/motion_classifier.json`.
- [x] Per-class recall: **stationary 100%, walking 88.9%, driving 91.7%** (overall 91.6%). Class-weighted loss handles heavy driving bias.
- [x] Browser inference module `web/src/motion/classifier.ts` — dot product + softmax, ~50 lines, no ML runtime.
- [x] Wired into live sensor stream: rolling 2-sec IMU window, evaluates once/sec, emits mode + confidence via callback.
- [x] Mode displayed in the /app status bar next to Heading + Speed.
- [ ] Feed classifier output back into Kalman config so `accel_process_std` auto-tunes per mode (walking wants lower value than driving). Needs a stepper API for live config changes.

## Inference API + on-device port
- [x] Streaming API + JSON-per-line stdio wrapper — `model/serve_stdio.py`. Aleena's backend spawns per session; batch/stream parity proven.
- [x] **Full port of the Kalman filter to TypeScript** — `web/src/kalman/{frames,matrix,filter,stepper}.ts`. Same equations as Python, runs entirely on-device in the browser. Enables airplane-mode operation.
- [x] StepResult carries full 2×2 covariance for the rotated ellipse.
- [x] **RTS backwards smoother** (`model/smoother.py`) — 5× tighter than online through the synth outage (1.4 m vs 6.4 m mean).

## App build (`web/`)
Vite + React + TypeScript + Tailwind + Mapbox GL + Motion + PWA. Deployed to Vercel as `beacon-sih.vercel.app`. Installable as an Android PWA (add-to-home-screen) or wrapped as an APK via PWABuilder.

### Shipped
- [x] Loader → Home → /app → /demo flow with proper page-load-only loader
- [x] Home page: Navigate CTA, Recent Drive card with **Strava-style static route preview** (Mapbox Static API + polyline encoding), Replay demo link, settings side-sheet (login/history placeholders + **offline tile cache button**)
- [x] `/app` — satellite map by default, follow-vehicle camera with 55° pitch, confidence ellipse, blue-dot vehicle marker
- [x] Full Google-Maps-style two-finger rotate + pinch + pitch via `touch-none` on the map container
- [x] Recenter button — always visible, forces `getCurrentPosition()` on tap, shows spinner while requesting + red MapPinOff when denied
- [x] Turn-by-turn navigation (Mapbox Directions + preset chips + free-text geocoding search)
- [x] **Offline route fallback** — 5 preset destinations have precomputed routes in `web/public/preset_routes.json`, loaded automatically when live Directions API fails
- [x] **Session logging** — every navigation logs 1 Hz samples to IndexedDB (~7 KB per 10-min drive). CSV export via `exportSessionAsCsv()`
- [x] `/demo` — split-screen raw vs Kalman, session picker dropdown so any locally-recorded session can replay through the split view
- [x] `/demo` GPS-lost centre pill + drift-counter HUD, mobile-responsive layout
- [x] Vercel deploy with SPA rewrites + `VITE_MAPBOX_TOKEN` env var; PWA manifest + icons + service worker with runtime Mapbox tile caching
- [x] End-to-end integration test with the deployed frontend (natural side-effect of building it)

### Remaining
- [ ] Backend hosting sign-off with Aleena — confirm Railway settings (backend URL for optional cloud mode)
- [ ] Wire `matched_path` event on the /demo fused side (backend already emits it)
- [ ] Wire the `/sessions/:id/smoothed` endpoint (Aleena shipped it) into /demo as an optional post-run playback layer

## Pitch narrative + demo ownership
- [ ] Lock the story: problem → why hybrid classical Kalman + on-device ML → the "wow" moment (raw-GPS path vs. corrected path on the map)
- [ ] Rehearse pitch to fit judging time slot
- [ ] Own the **live-demo go/no-go call** on demo day
- [ ] Ensure fallback video exists and is queued before we walk in

### Google Maps head-to-head (pitch anchor)
- [ ] Frame the comparison honestly: *not* "we beat Google everywhere" — "Google is great when GPS works; when GPS fails, the blue dot freezes or jumps hundreds of metres. We keep tracking continuously."
- [ ] Concrete numbers to have on the slide:
  - Our drift through a real GPS-loss segment (lock from the tunnel drive log)
  - Observed Google Maps behaviour in the same segment (freeze duration, jump distance)
  - Ratio / delta between the two

### In-car vlog — airplane-mode demo
Plan: film in the car with Google Maps + our system running side by side. Airplane mode on the phone kills Google's network-based fallbacks (wifi/cell positioning, A-GPS assist, map tiles). Google freezes hard, ours keeps tracking.

- [x] App works airplane-mode for GPS tracking + IMU dead reckoning + cached tiles + preset routing — no more "sensor phone tethered to hotspot" workaround needed. **Everything runs on-device.**
- [ ] Physical shoot: drive through Cubbon Park underpass or Manyata basement with the APK installed on Raga's phone
- [ ] Screen-record Google Maps on a second phone during the drive so the vlog can pixel-compare positions frame by frame
- [ ] Have a physical ground-truth reference (marked cone, known intersection) so the vlog can show "actual truth vs. Google vs. us" in the same frame
- [ ] Rehearse setup at least once before the shoot

## Coordination
- [x] Sign off on the live-ingestion schema with Angad + Aleena
- [ ] Sign off on backend hosting choice with Aleena (Railway; confirm URL + whether we need `SESSIONS_API_KEY` for demo day — currently off, correct choice)
- [x] End-to-end integration test with the deployed frontend

## SIH judging rubric — remaining fixable weaknesses (from 71/100 → target 85+)
- [ ] **Business model** (currently 4/10) — write a one-page: hero customer (Bengaluru quick-commerce fleets), pricing (freemium SDK, per-vehicle/month over threshold), adoption path, unit economics. **~1 hr of writing.**
- [ ] **Pitch narrative** (currently 6/10) — see above. **~half a day.**
- [ ] **Relevance to problem statement** (7/10) — pitch reframe: "hybrid Bayesian inference + on-device ML classifier, chosen over end-to-end deep learning for interpretability and on-device deployment." **20 min of framing.**
- [ ] **Prototype tunnel demo** (7/10) — needs the outage drive log.
