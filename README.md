# Beacon — Intelligent Dead Reckoning for smartphone-only vehicle navigation
## Smart India Hackathon 2026 · Problem Statement SIH26168

> **Try it now:** [beacon-sih.vercel.app](https://beacon-sih.vercel.app) · installable as a PWA / Android APK  
> **Backend (optional cloud path):** [sih-2026-backend-production.up.railway.app](https://sih-2026-backend-production.up.railway.app)  
> Sensor data schema is locked — see [`data_schema.md`](data_schema.md).

---

## The problem

A delivery rider on a scooter drops into the basement parking of a mall to hand off a quick-commerce order. Their phone's GPS blue dot freezes, then jumps 200 metres across the map. They miss the exit ramp, waste four minutes, and the order is late.

This happens millions of times a day across Indian cities — in metro underground parking, road and rail tunnels, and the dense urban canyons of high-rise clusters. GNSS signals are inherently weak and easily blocked by structures, foliage, and interference. **Most Indian vehicles — commercial trucks, older cars, and the crores of two-wheelers on the road — have no factory-fitted Inertial Navigation System (INS)** to fall back on. They rely entirely on a smartphone in a dashboard mount, and consumer-grade smartphone sensors alone drift wildly within seconds of losing GPS.

**Our goal:** turn a standalone smartphone into an Intelligent Dead Reckoning system that seamlessly bridges GNSS outages — no vehicle hardware connection required — and snaps back to GNSS-aided tracking the instant signal returns.

---

## What we built

**A production-shape mobile navigation app**, not a research prototype:

| Feature | Where | Status |
|---|---|---|
| Live map, turn-by-turn navigation, Google-Maps-style 3D nav camera | `web/src/pages/MainApp.tsx` | Shipped |
| Search any place in India (Mapbox Geocoding) + Directions preview flow | `web/src/nav/` | Shipped |
| **On-device Kalman filter** — 30 Hz IMU + 1 Hz GPS fusion, runs entirely in the browser | `web/src/kalman/` | Shipped |
| **On-device ML motion classifier** — walking / driving / stationary, ~91.6% accuracy | `web/src/motion/` | Shipped |
| **Split-screen demo** — Kalman-corrected vs. raw GPS through a real 6-second GPS gap | `web/src/pages/DemoView.tsx` | Shipped |
| **Airplane-mode operation** — precomputed routes + cached tiles + on-device filter | `web/src/nav/`, `vite.config.ts` | Shipped |
| **PWA + Android APK** via `vite-plugin-pwa` + PWABuilder | `web/vite.config.ts` | Shipped |
| Local session logging → IndexedDB → CSV export | `web/src/data/sessionStore.ts` | Shipped |
| Backend fusion service (Node/Express/Socket.io on Railway) — optional cloud path | `server/` | Shipped |
| Python Kalman batch pipeline, RTS smoother, tuning sweeps | `model/` | Shipped |
| Map-matching against OSRM | Backend endpoint | Scoped, Tier 1 |

---

## Architecture

Beacon is a **hybrid on-device / cloud-optional** system. The default path is fully on-device so the app works in airplane mode:

```
┌───────────────────────────────────────────────────────────────┐
│  Smartphone (PWA / APK)                                       │
│                                                               │
│   DeviceMotion 30 Hz ──┐                                      │
│                        ├─► Kalman filter (TS) ──► Fused pos ──┼─► Map
│   Geolocation 1 Hz ────┘         │                            │
│                                  ▼                            │
│                       Motion classifier (numpy weights)       │
│                                  │                            │
│                                  ▼                            │
│                       IndexedDB session log                   │
│                                                               │
└──────────────────────────────┬────────────────────────────────┘
                               │  (optional)
                               ▼
┌───────────────────────────────────────────────────────────────┐
│  Backend (Node + Express + Socket.io + Python subprocess)     │
│                                                               │
│   Same Kalman filter (Python) with bit-for-bit parity to TS   │
│   OSRM map-matching endpoint (scoped)                         │
│   SQLite session persistence                                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Fusion pipeline

| Stage | What it does | Status |
|---|---|---|
| **Signal conditioning** | iOS Core Motion / Android linear-acceleration — gravity-removed, bias-compensated. Raw sensors leak gravity into horizontal axes; this alone caused ~70 m drift on real data before we switched. | Shipped |
| **Dead reckoning (INS)** | Integrate IMU acceleration + gyro-derived heading into ENU position/velocity during GNSS-denied stretches. | Shipped |
| **GNSS + INS fusion (Kalman)** | 2D state `[E, N, vE, vN]` in a local ENU tangent plane, IMU as control input, GPS as measurement update. Runs at 30 Hz on-device. | Shipped |
| **Seamless mode switching** | Filter transparently drops to prediction-only when GPS goes stale, snaps back on the next fresh fix. Millisecond-scale transitions. | Shipped |
| **Motion classifier** | Multinomial logistic regression on 6 IMU features (accel/gyro magnitudes, vertical-cadence, jerk). ~91.6% accuracy. Displayed in the UI; feed-back into filter noise tuning is queued. | Shipped |
| **RTS smoother** | Backwards Rauch-Tung-Striebel pass over the forward-filter output. Tightens through-outage error by ~5×. Used for the batch-analysis + demo replay CSVs. | Shipped |
| **Map matching** | Snap the corrected trajectory to real road segments via OSRM. Backend endpoint scoped. | Tier 1 |
| **Full-orientation alignment** | Pitch / roll / yaw estimation of the phone relative to the vehicle. Current build assumes level vehicle + yaw-only heading. | Tier 2 |

### Why classical Kalman (with a small on-device ML component)

- **Interpretable + provably optimal** for our linear state space under Gaussian noise. A learned fusion model might match it; it wouldn't beat it on the fundamentals.
- **Deterministic on-device execution** — no ML runtime, no model weights to ship, sub-2% CPU on mid-range Android.
- **The ML is where it earns its complexity:** the motion-mode classifier is a legitimate ML component (trained, validated, deployed) that gives the system contextual awareness the filter alone can't provide.

---

## Measured results

| Scenario | Mean drift | Baseline (raw-GPS interp.) | Improvement |
|---|---|---|---|
| Synthetic 60 s scenario, 20 s GPS-loss window | **1.4 m** through outage | 11.9 m | **~8×** |
| Real drive, 33-min / 12.3 km, North Bengaluru (2026-09-03), natural 6 s GPS gap | **1.8 m** vs raw GPS online, **~1.2 m** with RTS smoother | — | — |
| Real drive, ~3 km, Bengaluru (2026-09-02a) | 2.3 m online, 1.7 m smoothed | — | — |
| Real drive, ~5 km, Bengaluru (2026-09-02b) | 3.0 m online, 2.1 m smoothed | — | — |

All numbers computed by `model/plot_metrics.py` — charts under `charts/`.

**Basement-descent capture is scoped for the tunnel-scenario benchmark** — the natural extension of the demo now that on-device replay works cleanly.

### Performance targets (from problem statement)

- **Dead-reckoning drift:** < 10% of distance traveled (e.g., < 100 m drift over 1 km GNSS-denied stretch at 60 km/h). Current real-log drift is ~0.15% over an unrestricted-GPS drive.
- **GNSS + INS fusion rate:** 10 Hz on smartphone target. Beacon runs the filter at 30 Hz in the browser at < 2% CPU. Edge-deployable engine with FOG-based IMU could push this to 200 Hz.

---

## Tech stack

**Frontend / mobile app** — `web/`
- **React 18 + TypeScript + Vite** — deployed to Vercel
- **Tailwind CSS + shadcn-style UI** — custom component set at `web/src/components/ui.tsx`
- **Mapbox GL JS** — vector tiles, 3D nav camera, dynamic style switching
- **`vite-plugin-pwa` + Workbox** — installable PWA, offline tile cache, precomputed route fallback
- **PWABuilder** — Android APK generation from the deployed PWA

**Fusion model** — `model/`
- **Python 3 + NumPy + Pandas** — hand-rolled linear Kalman filter (no `filterpy`, no PyTorch)
- **Streaming inference:** `SessionStepper` exposed over JSON-per-line stdio (`serve_stdio.py`)
- **RTS smoother** (`smoother.py`) — backwards pass over filter output
- **Full TypeScript port** at `web/src/kalman/` — same equations, bit-for-bit parity with the Python reference. Enables airplane-mode operation.

**Motion classifier** — `model/motion_classifier/`
- **Pure-numpy multinomial logistic regression** — no scikit-learn, no PyTorch
- Trained on our five real captures — walking / driving / stationary
- Six IMU features (accel magnitude, gyro magnitude, vertical accel std, jerk, cadence proxy)
- Inverse-frequency class weights in cross-entropy loss (driving class is heavily overrepresented in raw data)
- Weights export to `web/public/motion_classifier.json` — browser inference is ~50 lines of dot-product + softmax

**Backend** — `server/`
- **Node.js + Express + Socket.io** — real-time bi-directional streaming
- **Python subprocess per connection** — spawns `serve_stdio.py`, proven bit-for-bit output parity with batch runs
- **SQLite** — session persistence
- **CORS-locked** to the Vercel origin; **rate-limited** with proxy-aware trust config for Railway
- **Deployed on Railway**

**Data**
- **Our own iOS SensorLog captures** — five schema-conformant CSVs under `data/real/`, including a 12.3 km / 33-minute drive with a natural 6-second GPS gap
- **Adapter** (`model/adapters/ios_sensorlog.py`) — Core Motion (gravity-removed accel, bias-compensated gyro) preferred over raw sensors
- **Timestamp repair** (`model/adapters/repair_timestamps.py`) — redistributes IMU samples inside GPS-aligned buckets so the batch pipeline can emit dense output during outages
- Public IMU datasets (RIDI, RoNIN, IO-VNBD) available as supplements if real-log tuning shows gaps

---

## Repository layout

```
SIH/
├── README.md                    ← you are here
├── data_schema.md               ← locked sensor CSV schema
├── data/
│   ├── real/                    ← iOS SensorLog captures (schema-conformant)
│   └── synth/                   ← synthetic scenarios for baseline benchmarks
├── model/                       ← Python Kalman + smoother + classifier
│   ├── kalman.py, frames.py     ← core filter + ENU projection
│   ├── stepper.py               ← streaming API (SessionStepper)
│   ├── smoother.py              ← RTS backwards pass
│   ├── serve_stdio.py           ← JSON-per-line wrapper for the backend
│   ├── adapters/                ← iOS SensorLog → schema CSV
│   ├── motion_classifier/       ← numpy trainer + weight exporter
│   ├── plot_metrics.py          ← error charts → charts/
│   └── run_on_log.py            ← batch runner for a full CSV
├── server/                      ← Node/Express/Socket.io backend
├── web/                         ← React/TypeScript PWA (deployed to Vercel)
│   ├── src/kalman/              ← on-device TS port (mirrors model/)
│   ├── src/motion/              ← browser inference for the classifier
│   ├── src/nav/                 ← Mapbox routing, Directions preview, offline fallback
│   ├── src/map/                 ← imperative Mapbox wrapper (MapView.tsx)
│   ├── src/pages/               ← Loader, Home, MainApp (/app), DemoView (/demo)
│   ├── src/data/                ← live sensor stream, drive replay, session store
│   └── public/data/             ← bundled real-drive CSV for the demo replay
├── charts/                      ← generated error metric PNGs
├── todos/                       ← per-teammate todo files
└── pitch.md                     ← 90 s pitch script + Q&A prep + team blurbs
```

---

## Team

| Owner | Contribution |
|---|---|
| **Palak** | Team lead · product owner (mobile app + web) · on-device TypeScript port of the Kalman filter · motion-mode ML classifier (train + browser inference) · filter tuning on real drives · inference API · pitch narrative · demo owner |
| **Angad** | Sensor engineering (IMU/GPS instrumentation) · Kalman filter design review · timestamp alignment |
| **Raga** | Data collection · iOS SensorLog captures (5+ drives, incl. the 12.3 km production dataset) · basement-descent tunnel capture (in flight) |
| **Aleena** | Backend (Node/Express/Socket.io) · Python-subprocess bridge · session persistence · Railway deploy · CORS + rate-limit hardening |
| **Charvi** | Visual design · brand iteration · pitch-deck visuals |
| **Aarushi** | Documentation · README stewardship · architecture diagram |

---

## Architecture diagram

<img width="2720" height="2480" alt="idr_system_architecture" src="https://github.com/user-attachments/assets/f4a0faed-63cb-4034-8f18-71e3519e71b2" />

---

## Running locally

```bash
# Frontend (Vite dev server on :5173)
cd web && npm install && npm run dev

# Backend (Node on :4000)
cd server && npm install && npm run dev

# Regenerate the batch Kalman CSVs from a raw drive log
python model/adapters/repair_timestamps.py data/real/ios_drive_2026-09-03.csv data/real/ios_drive_2026-09-03_dense.csv
python model/run_on_log.py data/real/ios_drive_2026-09-03_dense.csv --outdir data/real/output_dense
cp data/real/output_dense/corrected_path.csv web/public/data/drive_corrected.csv
cp data/real/output_dense/raw_gps_path.csv web/public/data/drive_raw_gps.csv

# Regenerate error charts
python model/plot_metrics.py

# Retrain the motion classifier
python -m model.motion_classifier.train
```

Set `VITE_MAPBOX_TOKEN` in `web/.env.local` for map tiles + routing.  
Set `VITE_BACKEND_URL` in `web/.env.local` to point the frontend at Aleena's Railway backend instead of running fully on-device (optional).
