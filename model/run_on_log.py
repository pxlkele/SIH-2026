"""End-to-end: read a sensor CSV log, run the Kalman filter, dump two paths.

Outputs:
  output/raw_gps_path.csv       — raw GPS points only (drops null rows)
  output/corrected_path.csv     — fused position at every IMU timestep
                                  (this is what the map should draw for the
                                  "raw vs. corrected" wow moment)

Usage:
  python run_on_log.py <input.csv> [--outdir output]
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from frames import ENUOrigin, device_accel_to_world, en_to_latlon, integrate_heading, latlon_to_en
from ingest import Sample, read_log
from kalman import KalmanConfig, KalmanFilter2D


def run(input_path: Path, outdir: Path) -> dict:
    outdir.mkdir(parents=True, exist_ok=True)

    kf = KalmanFilter2D(KalmanConfig())
    origin: ENUOrigin | None = None
    heading = 0.0
    last_ts_ms: int | None = None
    first_fix: tuple[int, float, float] | None = None  # (ts_ms, east, north)

    raw_rows: list[dict] = []
    corrected_rows: list[dict] = []

    gps_fixes = 0
    imu_samples = 0

    for s in read_log(input_path):
        imu_samples += 1

        if origin is None:
            # Wait for first GPS fix to set the tangent-plane origin.
            if not s.has_gps:
                continue
            origin = ENUOrigin(lat_deg=s.gps_lat, lon_deg=s.gps_lon)
            first_fix = (s.timestamp_ms, 0.0, 0.0)
            last_ts_ms = s.timestamp_ms
            raw_rows.append(_raw_row(s))
            gps_fixes += 1
            # Don't init the KF yet — wait for a second GPS fix so we can
            # bootstrap an initial velocity from the position delta.
            continue

        if not kf.initialised:
            if s.has_gps:
                assert first_fix is not None
                east_m, north_m = latlon_to_en(s.gps_lat, s.gps_lon, origin)
                dt = (s.timestamp_ms - first_fix[0]) / 1000.0
                if dt > 0:
                    ve = (east_m - first_fix[1]) / dt
                    vn = (north_m - first_fix[2]) / dt
                    kf.initialise(east_m, north_m, ve=ve, vn=vn)
                    last_ts_ms = s.timestamp_ms
                    _record(corrected_rows, s.timestamp_ms, origin, kf, heading)
                    raw_rows.append(_raw_row(s))
                    gps_fixes += 1
            continue

        dt = max(0.0, (s.timestamp_ms - last_ts_ms) / 1000.0)
        last_ts_ms = s.timestamp_ms

        heading = integrate_heading(heading, s.gyro_z, dt)
        a_east, a_north = device_accel_to_world(s.accel_x, s.accel_y, heading)

        kf.predict(dt=dt, accel_e=a_east, accel_n=a_north)

        if s.has_gps:
            east_m, north_m = latlon_to_en(s.gps_lat, s.gps_lon, origin)
            acc = s.gps_accuracy_m if s.gps_accuracy_m is not None else 10.0
            kf.update_gps(east_m, north_m, acc)
            raw_rows.append(_raw_row(s))
            gps_fixes += 1

        _record(corrected_rows, s.timestamp_ms, origin, kf, heading)

    _write_csv(outdir / "raw_gps_path.csv",
               ["timestamp_ms", "lat", "lon", "accuracy_m"], raw_rows)
    _write_csv(outdir / "corrected_path.csv",
               ["timestamp_ms", "lat", "lon", "std_e_m", "std_n_m", "heading_rad"],
               corrected_rows)

    return {
        "imu_samples": imu_samples,
        "gps_fixes": gps_fixes,
        "corrected_points": len(corrected_rows),
        "raw_points": len(raw_rows),
    }


def _record(rows: list[dict], ts_ms: int, origin: ENUOrigin,
            kf: KalmanFilter2D, heading: float) -> None:
    east, north = kf.position()
    lat, lon = en_to_latlon(east, north, origin)
    std_e, std_n = kf.position_std()
    rows.append({
        "timestamp_ms": ts_ms,
        "lat": lat,
        "lon": lon,
        "std_e_m": std_e,
        "std_n_m": std_n,
        "heading_rad": heading,
    })


def _raw_row(s: Sample) -> dict:
    return {
        "timestamp_ms": s.timestamp_ms,
        "lat": s.gps_lat,
        "lon": s.gps_lon,
        "accuracy_m": s.gps_accuracy_m,
    }


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("--outdir", type=Path, default=Path("output"))
    args = p.parse_args()

    stats = run(args.input, args.outdir)
    print(f"IMU samples:      {stats['imu_samples']}")
    print(f"GPS fixes:        {stats['gps_fixes']}")
    print(f"Corrected points: {stats['corrected_points']}  -> {args.outdir}/corrected_path.csv")
    print(f"Raw GPS points:   {stats['raw_points']}  -> {args.outdir}/raw_gps_path.csv")


if __name__ == "__main__":
    main()
