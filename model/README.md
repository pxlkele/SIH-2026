# Kalman fusion model — SIH26168

**Ownership:**
- **Angad** — the state-space filter itself (`kalman.py`, `frames.py`)
- **Palak** — tuning on real data, inference-serving API on top, demo

Fuses raw IMU + GPS (per the locked `../data_schema.md`) into a corrected 2D
path for dead reckoning through GPS gaps. The first cut in this folder was
scaffolded by Palak to unblock the pipeline — Angad may refactor freely.

## Design (first cut)

- **Linear Kalman filter** in a local ENU (East-North-Up) tangent plane.
  Origin = first valid GPS fix.
- **State:** `[E, N, vE, vN]` — position + velocity, 2D. Cars stay on roads.
- **Control input:** IMU. Yaw-integrate `gyro_z` for heading, rotate
  device-frame `(accel_x, accel_y)` to world-frame `(aE, aN)`, feed as `u`.
- **Measurement:** GPS `(lat, lon)`, converted to ENU. `R = diag(σ², σ²)` with
  `σ = max(gps_accuracy_m, min_gps_std_m)`.
- **Between GPS fixes:** predict-only. This is the dead-reckoning behaviour.

### Simplifying assumptions (revisit when real data lands)

- Vehicle roughly level → yaw-only heading (no roll/pitch estimation).
- No IMU bias estimation. Real accelerometers drift; if the recorded log
  shows visible bias, add `[bE, bN]` to the state or preprocess a bias
  estimate from a stationary segment at the start of the run.
- Equirectangular lat/lon ↔ ENU is fine at car-demo scales (< ~10 km).
- Initial velocity is bootstrapped from the position delta between the
  first two GPS fixes so the filter doesn't waste seconds converging.

## Tuning knobs (see `kalman.py :: KalmanConfig`)

| Knob                    | What it controls                                           |
|-------------------------|------------------------------------------------------------|
| `accel_process_std`     | Trust in the IMU-control model. Higher = react to GPS faster, drift more during outage. |
| `min_gps_std_m`         | Floor on GPS measurement noise. Guards against optimistic accuracy reports. |
| `init_pos_std` / `init_vel_std` | Initial covariance. Rarely matters after a few GPS fixes. |

## Layout

```
model/
├── frames.py            # lat/lon <-> local ENU; heading integration; body->world accel
├── kalman.py            # linear KF: predict / update_gps
├── ingest.py            # schema-conformant CSV reader (preserves GPS nulls)
├── run_on_log.py        # end-to-end: log CSV -> raw + corrected path CSVs
├── evaluate.py          # scores fused path vs. ground truth by phase
├── synth/
│   ├── generate_log.py  # synthetic 60s scenario w/ 20s GPS-loss window
│   ├── synth_log.csv    # generated log conforming to data_schema.md
│   └── ground_truth.csv # true lat/lon per tick (eval only, NOT input)
└── output/
    ├── raw_gps_path.csv       # GPS points only, drops nulls
    └── corrected_path.csv     # fused position at every IMU tick
```

## Run it

```bash
pip install -r requirements.txt
python synth/generate_log.py                        # (once) make synth data
python run_on_log.py synth/synth_log.csv            # produces output/*.csv
python evaluate.py                                  # scores vs. ground truth
```

## Current numbers (synthetic 60s, 20s GPS-loss window)

| Phase        | Fused (KF) mean err | Raw-GPS-interp mean err |
|--------------|---------------------|--------------------------|
| before loss  | 3.7 m               | 4.1 m                    |
| **during loss** | **1.5 m**       | **11.9 m**               |
| after loss   | 1.3 m               | 3.2 m                    |

The `during_loss` row is the pitch number and the map-comparison "wow moment".
Note: synthetic scenario has no IMU bias and modest noise — expect looser
numbers on Raga's real car log.

## What's next

- Swap `synth/synth_log.csv` for Raga's real car log when available; re-tune
  `accel_process_std` if drift during real outages grows.
- Add IMU bias state if the real log shows measurable accelerometer drift.
- Wrap `run_on_log.py`'s inner loop as a **streaming stepper** so Aleena's
  backend can feed one sample at a time over WebSocket (this is the
  inference-serving API in `todos/palak.md`).
