# Beacon · Intelligent Dead Reckoning
## Smart India Hackathon — Problem Statement SIH26168

**Live: https://beacon-sih.vercel.app** — installable as an Android PWA (add-to-home-screen) or wrapped as a signed APK via [PWABuilder](https://pwabuilder.com).

> Sensor data schema is locked (`data_schema.md`).

**The Problem**

A delivery rider on a scooter drops into the basement parking of a mall to hand off a quick-commerce order. Their phone's GPS blue dot freezes, then jumps 200 meters across the map. They miss the exit ramp, waste four minutes, and the order is late. This happens millions of times a day across Indian cities — in metro underground parking, road and rail tunnels, and the dense urban canyons of high-rise clusters. GNSS signals are inherently weak and easily blocked by structures, foliage, and interference. Most Indian vehicles — commercial trucks, older cars, and the crores of two-wheelers on the road — have no factory-fitted Inertial Navigation System (INS) to fall back on. They rely entirely on a smartphone in a dashboard mount, and consumer-grade smartphone sensors alone drift wildly within seconds of losing GPS.

**Our goal:**

Turn a standalone smartphone into an Intelligent Dead Reckoning system that seamlessly bridges GNSS outages — no vehicle hardware connection required — and snaps back to GNSS-aided tracking the instant signal returns.

---

## Our Approach

| Stage | What it does |
|---|---|
| **In-Vehicle Alignment** *(planned)* | Estimate the phone's pitch, roll, and yaw relative to the vehicle's driving direction, regardless of mount type or position. **Current build:** yaw-only heading from `gyro_z`, level-vehicle assumption. |
| **Signal Conditioning** | Filter engine vibration, potholes, and mount noise from raw accelerometer / gyro streams before fusion. |
| **Motion-Mode Classifier (ML)** | On-device logistic regression on rolling 2-second IMU windows — classifies **walking / driving / stationary** with **~91% accuracy** on our real captures. Weights ship as a ~5 KB JSON, inference is a dot product + softmax in the browser. |
| **Dead Reckoning (INS)** | Integrate filtered IMU data to propagate position during GNSS-denied stretches. |
| **GNSS+INS Fusion (Kalman Filter)** | Fuse GNSS and IMU measurements to correct drift and produce a smooth, accurate position and velocity estimate. |
| **Post-Run RTS Smoother** | Same Kalman math run backwards through the log — **~5× tighter trajectory** through GPS-loss segments than the online filter. Used for the "definitive trajectory" playback. |
| **Map-Matching & Non-Holonomic Constraints** *(server-side, implemented)* | Snap the drifting inertial path back onto the real road/ramp geometry using OSRM. |
| **Seamless Mode Switching** | Transition between GNSS-aided and dead-reckoning modes within milliseconds of signal loss/reacquisition. |

We use a **hybrid architecture: classical Bayesian state estimation + a lightweight learned classifier**, both running fully on-device. The Kalman filter is provably optimal for our state space under Gaussian noise; the ML classifier handles motion-mode context that would need bespoke rules otherwise. We chose this over end-to-end deep learning because it's interpretable, data-efficient, deploys to any smartphone without a model runtime, and — critically — the whole thing runs in a browser tab with no server dependency.

---

## Anchor Use Case

We validate and demo against a concrete scenario: **underground/multi-level parking and connecting tunnel navigation**. Target benchmark: keep drift under 100m over 1km of GNSS-denied driving at 60 km/h.

**Current measured results:**

| Scenario | Online Kalman | RTS-smoothed |
|---|---|---|
| Synthetic 60s scenario, 20s GPS-loss window | **6.4 m** mean drift | **1.4 m** mean drift |
| Aggressive tuning on synth (`accel_process_std=0.5`) | **1.5 m** mean drift | — |
| Real drive · sep-02a (Bengaluru, 3.2 km) | **2.3 m** mean vs raw GPS | **1.7 m** |
| Real drive · sep-02b (Bengaluru, 4.7 km) | **3.0 m** mean vs raw GPS | **2.1 m** |
| Real drive · sep-03 (Bengaluru, 12.3 km, 33 min) | **1.8 m** mean vs raw GPS | **1.5 m** |

**~8× improvement vs raw-GPS linear-interpolation baseline through the outage.** Path length matches raw GPS to within 1% on multi-kilometre real drives.

Still open: a real drive log that *includes* an actual GPS-loss segment (tunnel / basement). All current captures have healthy GPS throughout — we can measure agreement with GPS but not real dead-reckoning behaviour yet.

---

## Tech Stack

**Runs entirely on-device.** The core value proposition is that everything below fits in a browser tab with no cloud dependency.

- **Frontend / Mobile app (`web/`):** Vite + React + TypeScript, Mapbox GL JS, Tailwind, motion animations, PWA (service worker + manifest + offline tile cache). Deployed to Vercel at [beacon-sih.vercel.app](https://beacon-sih.vercel.app), packaged as an Android APK via PWABuilder.
- **Kalman filter (dual implementation):** Python (`model/`) for training / evaluation / batch runs, and TypeScript port (`web/src/kalman/`) with bit-for-bit numerical parity for on-device inference.
- **Motion-mode classifier (`model/motion_classifier/`):** Pure NumPy trainer (no PyTorch, no scikit-learn), weights exported as JSON, inference in the browser.
- **Backend (`server/`):** Node.js + Express + Socket.io. Optional path for the pitch when we want to demonstrate the server-side architecture — spawns the Python filter as a subprocess per WebSocket connection, exposes replay + session-history endpoints, calls OSRM for map-matching. Deployed to Railway.
- **Maps:** Mapbox tiles (satellite / dark / streets), Mapbox Directions + Geocoding, OSRM for map-matching. Tiles pre-cached via service worker for airplane-mode support.
- **Dataset:** Our own iPhone SensorLog captures (6 files, including a 33-minute / 12.3 km real drive). Public IMU datasets (RIDI, RoNIN, IO-VNBD) are available if we ever need to supplement.

---

## Team

| Role | Owner |
|---|---|
| Team lead · full product surface (`web/`) · Kalman tuning · ML classifier · pitch narrative · demo | Palak |
| Sensor engineering (IMU/GPS instrumentation) · Kalman filter design | Angad |
| Data collection & ground-truth | Raga |
| Backend (`server/`) · storage · deploy | Aleena |
| Visual polish / brand iteration | Charvi |
| Documentation | Aarushi |

---

## Performance Targets

- **Dead reckoning drift:** < 10% of distance traveled (e.g., < 100m drift over 1km GNSS-denied stretch at 60 km/h). **Currently achieving 1.4 m through 20 s of GPS loss on synth**; awaits a real tunnel drive for the real-world number.
- **GNSS+INS fusion update rate:** 30–50 Hz on smartphone (limited by DeviceMotion tick rate); up to 200 Hz on edge-deployable engine with FOG-based IMU.
- **On-device compute:** Kalman + classifier together run in <2% CPU on a mid-range Android in a Chrome tab.
- **Offline capability:** GPS position, IMU dead-reckoning, motion classification, map tiles (cached area), and turn-by-turn to preset destinations all work airplane-mode. New free-text destination search + new routes to unseen destinations require network.

## Architecture Diagram 

<img width="2720" height="2480" alt="idr_system_architecture" src="https://github.com/user-attachments/assets/f4a0faed-63cb-4034-8f18-71e3519e71b2" />
