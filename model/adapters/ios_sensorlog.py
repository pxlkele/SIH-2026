"""Convert iOS SensorLog exports to our locked CSV schema.

SensorLog (and similar iOS logging apps) produce very wide CSVs: one row per
IMU sample with every recent value forward-filled. We need:

  * `timestamp_ms`     — Unix ms       ← `locationTimestamp_since1970` (fallback: `loggingTime`)
  * `accel_x/y/z`      — m/s²           ← `accelerometerAccelerationX/Y/Z` (G, multiply by 9.80665)
  * `gyro_x/y/z`       — rad/s          ← `gyroRotationX/Y/Z`
  * `gps_lat/lon`      — nullable       ← `locationLatitude/Longitude(WGS84)`
                                          null when `locationTimestamp_since1970`
                                          did NOT change since the last row
  * `gps_accuracy_m`   — nullable       ← `locationHorizontalAccuracy(m)`
                                          null on the same rows as lat/lon

iOS reports GPS at ~1 Hz but the log samples IMU faster; between fixes the log
repeats the last GPS row. Our schema says gaps must be nulled (no forward-fill)
so downstream can tell real fixes from repeats. We detect a fresh fix by a
change in `locationTimestamp_since1970`. Also drop the first row's GPS if
`locationHorizontalAccuracy` is a sentinel (-1 or huge).

Usage:
  python -m model.adapters.ios_sensorlog <input.csv> <output.csv>
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

G_TO_MS2 = 9.80665
SCHEMA_HEADER = [
    "timestamp_ms",
    "accel_x", "accel_y", "accel_z",
    "gyro_x", "gyro_y", "gyro_z",
    "gps_lat", "gps_lon", "gps_accuracy_m",
]


def convert(src: Path, dst: Path) -> dict:
    with src.open("r", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        raise ValueError(f"empty input: {src}")

    _require_columns(rows[0].keys(), src)

    out_rows: list[list] = []
    last_loc_ts = None
    gps_fixes = 0
    imu_samples = 0

    for r in rows:
        # Timestamp: prefer location's since-1970 seconds when present; else the
        # loggingTime ISO string. We convert to Unix ms.
        loc_ts_s = _to_float(r.get("locationTimestamp_since1970(s)"))
        if loc_ts_s is not None and loc_ts_s > 0:
            ts_ms = int(loc_ts_s * 1000)
        else:
            ts_ms = _iso_to_ms(r.get("loggingTime(txt)"))
        if ts_ms is None:
            continue

        # Accel is in Gs on iOS. Convert to m/s².
        ax = _to_float(r.get("accelerometerAccelerationX(G)"))
        ay = _to_float(r.get("accelerometerAccelerationY(G)"))
        az = _to_float(r.get("accelerometerAccelerationZ(G)"))
        gx = _to_float(r.get("gyroRotationX(rad/s)"))
        gy = _to_float(r.get("gyroRotationY(rad/s)"))
        gz = _to_float(r.get("gyroRotationZ(rad/s)"))
        if None in (ax, ay, az, gx, gy, gz):
            continue

        ax *= G_TO_MS2
        ay *= G_TO_MS2
        az *= G_TO_MS2
        imu_samples += 1

        # GPS: only emit when locationTimestamp changed (real fresh fix).
        # Also drop obviously-bad fixes (accuracy sentinel < 0 or absurd).
        lat = _to_float(r.get("locationLatitude(WGS84)"))
        lon = _to_float(r.get("locationLongitude(WGS84)"))
        acc = _to_float(r.get("locationHorizontalAccuracy(m)"))
        fresh = loc_ts_s is not None and loc_ts_s != last_loc_ts
        good = acc is not None and 0 < acc < 500
        if fresh and good and lat is not None and lon is not None:
            gps_lat, gps_lon, gps_acc = f"{lat:.7f}", f"{lon:.7f}", f"{acc:.2f}"
            last_loc_ts = loc_ts_s
            gps_fixes += 1
        else:
            gps_lat = gps_lon = gps_acc = ""

        out_rows.append([
            ts_ms,
            _f(ax), _f(ay), _f(az),
            _f(gx, 6), _f(gy, 6), _f(gz, 6),
            gps_lat, gps_lon, gps_acc,
        ])

    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(SCHEMA_HEADER)
        w.writerows(out_rows)

    return {
        "input_rows": len(rows),
        "output_rows": len(out_rows),
        "gps_fixes": gps_fixes,
        "imu_samples": imu_samples,
    }


REQUIRED_IOS_COLUMNS = (
    "loggingTime(txt)",
    "accelerometerAccelerationX(G)", "accelerometerAccelerationY(G)", "accelerometerAccelerationZ(G)",
    "gyroRotationX(rad/s)", "gyroRotationY(rad/s)", "gyroRotationZ(rad/s)",
    "locationLatitude(WGS84)", "locationLongitude(WGS84)",
    "locationHorizontalAccuracy(m)", "locationTimestamp_since1970(s)",
)


def _require_columns(headers, src: Path) -> None:
    missing = [c for c in REQUIRED_IOS_COLUMNS if c not in headers]
    if missing:
        raise ValueError(f"{src}: missing iOS SensorLog columns: {missing}")


def _to_float(v):
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def _f(v, digits: int = 5) -> str:
    return f"{v:.{digits}f}"


def _iso_to_ms(s):
    if not s:
        return None
    # Handles values like "2026-08-24T19:54:07.273+05:30"
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(s.strip())
        return int(dt.timestamp() * 1000)
    except (ValueError, TypeError):
        return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    stats = convert(args.input, args.output)
    print(f"input rows:   {stats['input_rows']}")
    print(f"output rows:  {stats['output_rows']}  (schema-conformant)")
    print(f"IMU samples:  {stats['imu_samples']}")
    print(f"GPS fixes:    {stats['gps_fixes']}  (fresh fixes only, forward-fills nulled)")
    print(f"wrote:        {args.output}")


if __name__ == "__main__":
    sys.exit(main())
