# Data Flow Documentation
### IDR with GNSS Fusion — SIH26168

> **Status:** Updated to match the locked `data_schema.md` (CSV, device-frame raw sensor values, 50Hz IMU / ~1Hz GPS).

---

## Overview

Data moves through the system in two distinct paths: an **offline training path** (used before the hackathon to build and validate models) and a **live on-device path** (used during inference/demo). Both paths share the same underlying schema so models trained offline transfer directly to on-device use.

---

## 1. Offline Path — Model Training

```
Raw sensor logs (phone app / IO-VNBD dataset)
        │
        ▼
Load & parse CSV
  (timestamp_ms, accel_x/y/z, gyro_x/y/z, gps_lat, gps_lon, gps_accuracy_m)
        │
        ▼
Validate schema (50Hz IMU rows, ~1Hz GPS rows, nulls left empty — never forward-filled)
        │
        ▼
Detect GNSS-loss windows (rows where gps_lat / gps_lon are null)
        │
        ▼
Frame alignment (device-frame → world/ENU frame — handled downstream by the
  Kalman filter, NOT at capture time, per locked schema decision)
        │
        ▼
Cleaned, schema-conformant session file
        │
        ▼
Model training (speed estimator, noise filter, fusion tuning)
        │
        ▼
Exported model (TFLite / ONNX) → app/models/exported/
```

**Inputs:** raw CSV per `data_schema.md` (synthetic/dummy rows are fine to start — no need to wait for real car data), session metadata (route, mount position, vehicle type)
**Output:** a schema-conformant session file, plus a trained/exported model artifact

---

## 2. Live Path — On-Device Inference

```
Phone sensors
  IMU (accel_x/y/z, gyro_x/y/z) @ 50Hz, device frame
  GNSS (gps_lat, gps_lon, gps_accuracy_m) @ ~1Hz, null when no fix
        │
        ▼
In-Vehicle Alignment & Calibration
        │
        ▼
AI Speed & Vibration Filter (on-device model, TFLite/ONNX)
        │
        ▼
        ├─── gps_lat/gps_lon present? ──Yes──▶ GNSS+INS Fusion (Kalman)
        │                                        (frame alignment happens here)
        └─── No (null) ──▶ Dead Reckoning (INS, device-frame integration)
                              ──▶ Map-Matching (OSM + NHC) ──▶ Fusion (Kalman)
        │
        ▼
Fused position + velocity (10Hz mobile / up to 200Hz edge engine)
        │
        ▼
Frontend: Live Map View + Replay View
```

**Inputs:** live IMU stream (50Hz), live GNSS stream (~1Hz, may be null), offline OSM map data
**Output:** continuous fused position/velocity stream consumed by the frontend

---

## 3. Schema Reference

All raw session data — whether from offline logging or live capture — conforms to the **locked** schema in [`data_schema.md`](./data_schema.md):

| Column | Type | Notes |
|---|---|---|
| `timestamp_ms` | int | Unix epoch milliseconds, UTC |
| `accel_x`, `accel_y`, `accel_z` | float | m/s², device frame |
| `gyro_x`, `gyro_y`, `gyro_z` | float | rad/s, device frame |
| `gps_lat` | float | nullable — empty when GPS unavailable |
| `gps_lon` | float | nullable — empty when GPS unavailable |
| `gps_accuracy_m` | float | nullable — GPS's own reported error radius, in meters |

Notes on how this schema is used downstream:
- **No magnetometer field** — orientation/heading is derived, not logged raw.
- **No explicit GNSS-loss flag** — a GNSS-denied window is any stretch where `gps_lat`/`gps_lon` are null; downstream code derives this rather than reading a stored label.
- **No world-frame position columns** (e.g. no ENU x/y in the raw file) — device-frame values are logged as-is, and frame alignment/gravity correction is the Kalman filter's job, not the logger's.
- **Format:** CSV, UTF-8, no BOM, header row required, one row per sensor reading.

---

## 4. Data Ownership Along the Pipeline

| Stage | Owner |
|---|---|
| Raw logging & sync | Data collection & ground-truth lead |
| Schema definition | Locked — see `data_schema.md` |
| Model training | ML lead |
| Fusion engine (incl. frame alignment) | Fusion engineer |
| Live ingestion (backend) | Aleena (backend hosting TBD) |
| Consumption (map rendering) | Frontend/visualization engineer |
