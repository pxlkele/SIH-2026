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
| **In-Vehicle Alignment & Calibration** | Automatically determines the phone's pitch, roll, and yaw relative to the vehicle's driving direction, regardless of mount type or position |
| **AI Speed & Vibration Filter** | Filters out engine vibration, potholes, and mount noise; estimates true forward velocity directly from noisy accelerometer/gyro signals |
| **Dead Reckoning (INS)** | Integrates filtered IMU data to propagate position during GNSS-denied stretches |
| **Map-Matching & Non-Holonomic Constraints** | Snaps the drifting inertial path back onto the real road/ramp geometry using OpenStreetMap data — a vehicle can't slide sideways or fly upward |
| **GNSS+INS Fusion (Kalman Filter)** | Fuses GNSS and IMU measurements to correct drift and produce a smooth, accurate position and velocity estimate |
| **Seamless Mode Switching** | Transitions between GNSS-aided and dead-reckoning modes within milliseconds of signal loss/reacquisition |

We use a classical Kalman filter (Unscented Kalman Filter) as the core fusion engine — chosen over a purely learned fusion model because it gives us an interpretable, well-understood error model and predictable behavior under the exact kind of noisy, real-world sensor data we're working with, while our AI/ML components (speed estimation, noise filtering) handle the parts that are hard to model analytically.

---

## Anchor Use Case

We validate and demo against a concrete scenario: **underground/multi-level parking and connecting tunnel navigation**, matching the benchmark of restricting drift to under 100m over 1km of GNSS-denied driving at 60 km/h.

---

## Tech Stack

- **Model training:** Python, PyTorch, NumPy, Pandas, `filterpy`
- **On-device inference:** TensorFlow Lite / ONNX Runtime Mobile
- **Mobile app:** [Android — Kotlin, or specify your stack]
- **Maps:** OpenStreetMap (offline), `osmnx`
- **Dataset:** IO-VNBD (Inertial and Odometry benchmark dataset for ground vehicle positioning), plus our own logged sessions



## Team

| Role | Owner |
|---|---|
| Data collection & ground-truth | — |
| ML / AI models | — |
| Fusion engine | — |
| Frontend / visualization | — |
| Documentation | — |

---

## Performance Targets

- **Dead reckoning drift:** < 10% of distance traveled (e.g., < 100m drift over 1km GNSS-denied stretch at 60 km/h)
- **GNSS+INS fusion update rate:** 10 Hz on smartphone; up to 200 Hz on edge-deployable engine with FOG-based IMU
