"""Generate a synthetic sensor log for development while Raga's real log lands.

Produces a ~60s car trajectory (constant speed, one gentle turn) sampled at
50 Hz IMU + 1 Hz GPS, with a configurable GPS-loss window in the middle.
Writes two files:
  synth/ground_truth.csv  — true lat/lon at every IMU tick (for evaluation only)
  synth/synth_log.csv     — schema-conformant sensor log (feed this to run_on_log.py)
"""

from __future__ import annotations

import csv
import math
import random
from pathlib import Path

# --- scenario config ---
DURATION_S = 60.0
IMU_HZ = 50
GPS_HZ = 1
GPS_LOSS_WINDOW_S = (25.0, 45.0)   # 20 seconds of pure dead-reckoning
SPEED_M_S = 12.0                    # ~43 km/h city driving
TURN_START_S = 20.0
TURN_END_S = 35.0
TURN_RATE_RAD_S = math.radians(3.0) # gentle curve

ORIGIN_LAT = 12.9716
ORIGIN_LON = 77.5946
EARTH_R = 6_378_137.0

# --- noise config ---
ACCEL_NOISE_STD = 0.15     # m/s^2 per axis
GYRO_NOISE_STD = 0.01      # rad/s per axis
GPS_ACC_M = 5.0            # reported accuracy
GPS_NOISE_STD = 4.0        # actual gaussian noise on GPS position

random.seed(42)


def main() -> None:
    outdir = Path(__file__).parent
    outdir.mkdir(exist_ok=True)

    dt = 1.0 / IMU_HZ
    n = int(DURATION_S * IMU_HZ)
    gps_period_ticks = IMU_HZ // GPS_HZ

    heading = 0.0                 # East-of-North
    east = 0.0
    north = 0.0
    t0_ms = 1_735_024_800_000     # matches example schema

    truth_rows: list[dict] = []
    log_rows: list[dict] = []

    for i in range(n):
        t_s = i * dt
        ts_ms = t0_ms + int(t_s * 1000)

        # Ground truth motion
        turning = TURN_START_S <= t_s < TURN_END_S
        gyro_z_true = TURN_RATE_RAD_S if turning else 0.0

        heading = _wrap_pi(heading + gyro_z_true * dt)
        v_east = SPEED_M_S * math.sin(heading)
        v_north = SPEED_M_S * math.cos(heading)
        east += v_east * dt
        north += v_north * dt

        # Body-frame accel: forward accel is 0 (constant speed), lateral accel = v * yaw_rate
        # In device frame we defined accel_x = forward (along heading), accel_y = lateral (right).
        # Centripetal accel points toward the turn centre. For a left turn (positive yaw rate,
        # heading increasing East-of-North grows toward East), centre is to the left, so lateral
        # accel in the body frame is negative-y (rightward positive convention).
        accel_x_true = 0.0
        accel_y_true = SPEED_M_S * gyro_z_true

        # Noisy sensor readings
        accel_x = accel_x_true + random.gauss(0, ACCEL_NOISE_STD)
        accel_y = accel_y_true + random.gauss(0, ACCEL_NOISE_STD)
        accel_z = 9.81 + random.gauss(0, ACCEL_NOISE_STD)
        gyro_x = random.gauss(0, GYRO_NOISE_STD)
        gyro_y = random.gauss(0, GYRO_NOISE_STD)
        gyro_z = gyro_z_true + random.gauss(0, GYRO_NOISE_STD)

        gps_lat: float | str = ""
        gps_lon: float | str = ""
        gps_acc: float | str = ""
        if i % gps_period_ticks == 0 and not (GPS_LOSS_WINDOW_S[0] <= t_s < GPS_LOSS_WINDOW_S[1]):
            noisy_east = east + random.gauss(0, GPS_NOISE_STD)
            noisy_north = north + random.gauss(0, GPS_NOISE_STD)
            gps_lat, gps_lon = _en_to_latlon(noisy_east, noisy_north)
            gps_acc = GPS_ACC_M

        true_lat, true_lon = _en_to_latlon(east, north)
        truth_rows.append({
            "timestamp_ms": ts_ms,
            "lat": true_lat,
            "lon": true_lon,
            "east_m": east,
            "north_m": north,
        })
        log_rows.append({
            "timestamp_ms": ts_ms,
            "accel_x": round(accel_x, 5),
            "accel_y": round(accel_y, 5),
            "accel_z": round(accel_z, 5),
            "gyro_x": round(gyro_x, 6),
            "gyro_y": round(gyro_y, 6),
            "gyro_z": round(gyro_z, 6),
            "gps_lat": gps_lat if gps_lat == "" else round(gps_lat, 7),
            "gps_lon": gps_lon if gps_lon == "" else round(gps_lon, 7),
            "gps_accuracy_m": gps_acc,
        })

    _write(outdir / "ground_truth.csv",
           ["timestamp_ms", "lat", "lon", "east_m", "north_m"], truth_rows)
    _write(outdir / "synth_log.csv",
           ["timestamp_ms", "accel_x", "accel_y", "accel_z",
            "gyro_x", "gyro_y", "gyro_z",
            "gps_lat", "gps_lon", "gps_accuracy_m"], log_rows)

    print(f"wrote {len(log_rows)} IMU samples -> synth/synth_log.csv")
    print(f"wrote {len(truth_rows)} truth rows -> synth/ground_truth.csv")
    print(f"GPS-loss window: {GPS_LOSS_WINDOW_S[0]}s .. {GPS_LOSS_WINDOW_S[1]}s")


def _en_to_latlon(east: float, north: float) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(ORIGIN_LAT))
    d_lat = north / EARTH_R
    d_lon = east / (EARTH_R * cos_lat)
    return ORIGIN_LAT + math.degrees(d_lat), ORIGIN_LON + math.degrees(d_lon)


def _wrap_pi(a: float) -> float:
    return (a + math.pi) % (2 * math.pi) - math.pi


def _write(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
