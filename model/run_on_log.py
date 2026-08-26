"""Batch runner: read a sensor CSV log, drive the SessionStepper, dump two paths.

Outputs:
  output/raw_gps_path.csv       — raw GPS points only (drops null rows)
  output/corrected_path.csv     — fused position at every step where the
                                  session is RUNNING (this is what the map
                                  draws for the raw-vs-corrected wow moment)

Usage:
  python run_on_log.py <input.csv> [--outdir output]

Batch and streaming share the exact same fusion logic — they both drive
SessionStepper.step(). This file just handles file I/O around it.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from ingest import Sample, read_log
from stepper import SessionState, SessionStepper


def run(input_path: Path, outdir: Path) -> dict:
    outdir.mkdir(parents=True, exist_ok=True)

    stepper = SessionStepper()
    raw_rows: list[dict] = []
    corrected_rows: list[dict] = []

    gps_fixes = 0
    imu_samples = 0

    for s in read_log(input_path):
        imu_samples += 1
        if s.has_gps:
            raw_rows.append(_raw_row(s))
            gps_fixes += 1

        result = stepper.step(s)
        if result.state == SessionState.RUNNING.value and result.lat is not None:
            corrected_rows.append({
                "timestamp_ms": result.timestamp_ms,
                "lat": result.lat,
                "lon": result.lon,
                "std_e_m": result.std_e_m,
                "std_n_m": result.std_n_m,
                "heading_rad": result.heading_rad,
            })

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
