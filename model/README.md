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
├── stepper.py           # SessionStepper — stateful, one sample in / one result out
├── run_on_log.py        # batch runner (drives SessionStepper over a CSV log)
├── serve_stdio.py       # streaming server — JSON-per-line stdio, spawn per session
├── smoke_stdio.py       # asserts stream output == batch output on the synth log
├── evaluate.py          # scores fused path vs. ground truth by phase
├── synth/
│   ├── generate_log.py  # synthetic 60s scenario w/ 20s GPS-loss window
│   ├── synth_log.csv    # generated log conforming to data_schema.md
│   └── ground_truth.csv # true lat/lon per tick (eval only, NOT input)
└── output/
    ├── raw_gps_path.csv       # GPS points only, drops nulls
    └── corrected_path.csv     # fused position at every IMU tick
```

Batch and streaming share the exact same fusion logic — both drive
`SessionStepper.step()`. `smoke_stdio.py` asserts they produce identical
output on the synth log.

## Run it

```bash
pip install -r requirements.txt
python synth/generate_log.py                        # (once) make synth data
python run_on_log.py synth/synth_log.csv            # batch → output/*.csv
python evaluate.py                                  # scores vs. ground truth
python smoke_stdio.py                               # streaming ↔ batch parity check
```

## Inference API — contract for Aleena's backend

Two ways to call the model from Node/Express:

### 1. In-process Python (if backend adds a Python worker)

```python
from stepper import SessionStepper
stepper = SessionStepper()               # one instance per user session
result = stepper.step(sample)            # sample is model.ingest.Sample
```

### 2. Subprocess stdio (matches locked stack — Node spawns Python)

Spawn once per session and stream:

```
child = spawn("python3", ["serve_stdio.py"], { cwd: "<repo>/model" })
```

**Request** — one JSON object per line on stdin:

| Field            | Type       | Notes                                              |
|------------------|------------|----------------------------------------------------|
| `timestamp_ms`   | int        | required — Unix epoch ms                           |
| `accel_x/y/z`    | number     | required — m/s², device frame                      |
| `gyro_x/y/z`     | number     | required — rad/s, device frame                     |
| `gps_lat`        | number\|null | optional — null when no GPS fix                  |
| `gps_lon`        | number\|null | optional                                         |
| `gps_accuracy_m` | number\|null | optional — GPS reported error radius, metres     |

**Response** — one JSON object per line on stdout:

| Field          | Type          | Notes                                                       |
|----------------|---------------|-------------------------------------------------------------|
| `state`        | string        | `waiting_first_fix` / `waiting_second_fix` / `running`      |
| `timestamp_ms` | int           | echoed from input                                           |
| `lat`          | number\|null  | fused position — **null** until `state == "running"`        |
| `lon`          | number\|null  | fused position                                              |
| `heading_rad`  | number\|null  | current heading estimate, East-of-North                     |
| `std_e_m`      | number\|null  | 1-σ position uncertainty (metres, East)                     |
| `std_n_m`      | number\|null  | 1-σ position uncertainty (metres, North)                    |
| `gps_used`     | bool          | whether this input sample contained a GPS fix consumed      |

On a bad input line the server writes `{"error": "...", "line_no": N}` and
keeps running — one malformed row does not kill the session.

**Session semantics:** each subprocess = one user session. Warm-start /
state persistence between samples happens naturally because the process
holds the filter state. To reset: restart the process.

## Current numbers

### Synthetic 60s scenario, 20s GPS-loss window

With the current default `accel_process_std=2.0`:

| Phase        | Fused (KF) mean err | Raw-GPS-interp mean err |
|--------------|---------------------|--------------------------|
| before loss  | 4.0 m               | 4.1 m                    |
| **during loss** | **6.4 m**       | **11.9 m**               |
| after loss   | 1.8 m               | 3.2 m                    |

With `accel_process_std=0.5` (aggressive, only safe on clean synth data):

| Phase        | Fused (KF) mean err | Raw-GPS-interp mean err |
|--------------|---------------------|--------------------------|
| before loss  | 3.7 m               | 4.1 m                    |
| **during loss** | **1.5 m**       | **11.9 m**               |
| after loss   | 1.3 m               | 3.2 m                    |

The 1.5 m result shows the ceiling of what the filter can achieve on ideal
data. The 6.4 m default is the same filter tuned to survive real-world IMU
noise; it still beats raw-GPS-interp by ~2× through the outage.

### Real drive (`data/real/ios_drive_2026-08-29.csv`, 2.5 min, iPhone SensorLog)
With the default `accel_process_std=2.0` (tuned against real Core Motion IMU):

| Metric | Value |
|---|---|
| Fused-path length | 408 m over 2.5 min |
| Fused-vs-raw agreement at GPS fixes | mean **9.1 m**, max 32.5 m |
| Mean 1-σ position uncertainty | 19.4 m |

Real IMU is noisier than synth — the filter needs a higher `accel_process_std`
to avoid over-trusting drift-prone IMU. Same knob, opposite direction as synth.

### Tuning knob sweep (aug29 real drive)

| `accel_process_std` | Path length (m) | Mean err vs raw GPS (m) |
|---|---|---|
| 0.5 (synth-tuned) | 912 | 27.2 |
| 1.0 | 625 | 15.8 |
| **2.0 (default)** | **408** | **9.1** |
| 3.0 | 343 | 6.4 |
| 5.0 | 307 | 4.4 |

Higher `accel_process_std` = filter trusts GPS more, IMU less — better on
noisy real data but starves dead-reckoning during actual GPS outages. 2.0
is the current best balance. Retune once we have a real GPS-outage segment
(tunnel, basement).

The synthetic `during_loss` row is still the pitch number and the map-comparison
"wow moment". Real-drive numbers are the honest engineering baseline.

## What's next

- Swap `synth/synth_log.csv` for Raga's real car log when available; re-tune
  `accel_process_std` if drift during real outages grows.
- Add IMU bias state if the real log shows measurable accelerometer drift.
- Aleena wires `serve_stdio.py` behind the WebSocket endpoint (spawn one
  process per socket connection, pipe JSON both ways).
