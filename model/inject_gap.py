"""Inject a synthetic GPS outage into a schema-conformant log.

Some captured drives have clean GPS the whole way through, which makes
the split-screen demo boring — both panels track identically. This
script nulls GPS lat/lon/accuracy in a specific time window so the
downstream Kalman pipeline enters pure dead-reckoning mode there.
Because the IMU data is untouched and the filter output during the
gap comes from real IMU integration, the "corrected" trace is honest.

Usage:
  python model/inject_gap.py <dense_input.csv> <output.csv> --gap-start 120 --gap-length 10

Times are trip-relative seconds from the first row.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


def inject(src: Path, dst: Path, gap_start_s: float, gap_length_s: float) -> dict:
    df = pd.read_csv(src)
    t0 = int(df["timestamp_ms"].iloc[0])
    start_ms = t0 + int(gap_start_s * 1000)
    end_ms = start_ms + int(gap_length_s * 1000)

    mask = (df["timestamp_ms"] >= start_ms) & (df["timestamp_ms"] < end_ms)
    before = int(df.loc[mask, "gps_lat"].notna().sum())

    df.loc[mask, "gps_lat"] = pd.NA
    df.loc[mask, "gps_lon"] = pd.NA
    df.loc[mask, "gps_accuracy_m"] = pd.NA

    dst.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(dst, index=False)

    return {
        "rows_in_gap": int(mask.sum()),
        "gps_nulled": before,
        "gap_starts_at_s": gap_start_s,
        "gap_ends_at_s": gap_start_s + gap_length_s,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--gap-start", type=float, required=True, help="Trip-relative seconds")
    p.add_argument("--gap-length", type=float, required=True, help="Seconds")
    args = p.parse_args()
    stats = inject(args.input, args.output, args.gap_start, args.gap_length)
    print(f"gap window:  t={stats['gap_starts_at_s']:.1f}s → t={stats['gap_ends_at_s']:.1f}s")
    print(f"rows in gap: {stats['rows_in_gap']}")
    print(f"gps nulled:  {stats['gps_nulled']} fixes")
    print(f"wrote:       {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
