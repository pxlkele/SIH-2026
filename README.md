# Intelligent Dead Reckoning (IDR) with GNSS Fusion
## Smart India Hackathon — Problem Statement SIH26168

**The Problem**

A delivery rider on a scooter drops into the basement parking of a mall to hand off a quick-commerce order. Their phone's GPS blue dot freezes, then jumps 200 meters across the map. They miss the exit ramp, waste four minutes, and the order is late.This happens millions of times a day across Indian cities — in metro underground parking, road and rail tunnels, and the dense urban canyons of high-rise clusters. GNSS signals are inherently weak and easily blocked by structures, foliage, and interference. Most Indian vehicles — commercial trucks, older cars, and the crores of two-wheelers on the road — have no factory-fitted Inertial Navigation System (INS) to fall back on. They rely entirely on a smartphone in a dashboard mount, and consumer-grade smartphone sensors alone drift wildly within seconds of losing GPS.

**Our goal:**

Turn a standalone smartphone into an Intelligent Dead Reckoning system that seamlessly bridges GNSS outages — no vehicle hardware connection required — and snaps back to GNSS-aided tracking the instant signal returns.

---

## Our Approach

| Stage | What it does |
|---|---|
| **In-Vehicle Alignment** *(planned)* | Estimate the phone's pitch, roll, and yaw relative to the vehicle's driving direction, regardless of mount type or position. **Current build:** yaw-only heading from `gyro_z`, level-vehicle assumption. |
| **Signal Conditioning** | Filter engine vibration, potholes, and mount noise from raw accelerometer / gyro streams before fusion. |
| **Dead Reckoning (INS)** | Integrate filtered IMU data to propagate position during GNSS-denied stretches. |
| **Map-Matching & Non-Holonomic Constraints** *(planned)* | Snap the drifting inertial path back onto the real road/ramp geometry using OpenStreetMap data — a vehicle can't slide sideways or fly upward. **Backend endpoint against OSRM is scoped for Tier 1.** |
| **GNSS+INS Fusion (Kalman Filter)** | Fuse GNSS and IMU measurements to correct drift and produce a smooth, accurate position and velocity estimate. |
| **Seamless Mode Switching** | Transition between GNSS-aided and dead-reckoning modes within milliseconds of signal loss/reacquisition. |

We use a **classical linear Kalman filter** as the core fusion engine — 2D state `[E, N, vE, vN]` in a local ENU tangent plane, with the IMU stream as the control input and GPS as the measurement update. Chosen over a learned fusion model because it gives us an interpretable, well-understood error model, predictable behaviour under noisy real-world sensor data, and — critically — deterministic on-device behaviour without a model runtime. Angad may promote to an EKF or add IMU bias state as real-log tuning demands.

---

## Anchor Use Case

We validate and demo against a concrete scenario: **underground/multi-level parking and connecting tunnel navigation**. Target benchmark: keep drift under 100m over 1km of GNSS-denied driving at 60 km/h.

**Current measured result** (60s synthetic scenario with a 20s GPS-loss window): **1.5 m mean position error through the outage vs. 11.9 m for a raw-GPS linear-interpolation baseline** — an ~8× improvement. Real-log tuning against Raga's captured drive is in progress.

---

## Tech Stack

**Product vision — on-device mobile:**
- **Mobile app:** Android (Kotlin) — planned. Kalman filter would be ported from Python to Kotlin for on-device execution.
- **Maps:** OpenStreetMap tiles, with pre-downloaded offline coverage for GNSS-denied areas.

**Hackathon demo architecture — what we're actually running for judges:**
- **Fusion model (`model/`):** Python — NumPy + Pandas. Hand-rolled linear Kalman filter (no `filterpy`, no PyTorch — there is no learned model to train). Streaming inference via `SessionStepper` exposed over JSON-per-line stdio (`serve_stdio.py`).
- **Backend (`server/`):** Node.js + Express + Socket.io. Spawns the Python filter as a subprocess per WebSocket connection; also accepts CSV replay via `POST /replay/:socketId` as a fallback path.
- **Frontend:** React + shadcn/ui + Tailwind, deployed to Vercel. Renders raw GPS path vs. Kalman-corrected path on a live map (Mapbox GL JS or Leaflet + OSM).
- **Map-matching (Tier 1, planned):** OSRM public map-matching API — snaps the corrected trajectory to real road segments.
- **Dataset:** Our own car-based sensor log (Raga, complete). Public IMU datasets (RIDI, RoNIN, IO-VNBD) available as supplements if real-log tuning shows gaps.



## Team

| Role | Owner |
|---|---|
| Team lead · inference API · tuning · demo owner | Palak |
| Sensor engineering (IMU/GPS instrumentation) · Kalman filter | Angad |
| Data collection & ground-truth | Raga |
| Backend | Aleena |
| Frontend / visualization | Charvi |
| Documentation | Aarushi |

---

## Performance Targets

- **Dead reckoning drift:** < 10% of distance traveled (e.g., < 100m drift over 1km GNSS-denied stretch at 60 km/h)
- **GNSS+INS fusion update rate:** 10 Hz on smartphone; up to 200 Hz on edge-deployable engine with FOG-based IMU
