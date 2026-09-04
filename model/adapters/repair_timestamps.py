"""Repair timestamp collisions in adapter output.

The iOS SensorLog adapter (ios_sensorlog.py) uses `locationTimestamp` as
the row timestamp, but that value is only refreshed on new GPS fixes.
IMU rows between fixes inherit the last GPS timestamp verbatim — 30-200
IMU samples per second collapse into a single timestamp value. The
Kalman batch pipeline then sees zero elapsed time between them and can
only emit one corrected sample per GPS interval, so the split-screen
demo shows nothing during a 6-second GPS outage.

This script redistributes row timestamps linearly within each bucket:
if 210 rows share timestamp T and the next unique timestamp is T+6000ms,
we spread them at ~28.5 ms intervals across those 6 seconds. Preserves
row order (SensorLog samples are chronological within a bucket).

Usage:
  python -m model.adapters.repair_timestamps <input.csv> <output.csv>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


def repair(src: Path, dst: Path) -> dict:
    df = pd.read_csv(src)
    df = df.sort_values("timestamp_ms", kind="stable").reset_index(drop=True)

    unique_ts = df["timestamp_ms"].drop_duplicates().sort_values().reset_index(drop=True)
    next_ts_map = dict(zip(unique_ts.iloc[:-1], unique_ts.iloc[1:]))

    # For the very last bucket, we don't know the end. Assume the median
    # per-row spacing observed elsewhere in the log so the tail doesn't
    # instantaneously collapse.
    all_spacings = []
    new_ts = df["timestamp_ms"].values.astype("int64").copy()

    bucket_start = 0
    for i in range(1, len(df) + 1):
        end_of_bucket = (i == len(df)) or (df.at[i, "timestamp_ms"] != df.at[bucket_start, "timestamp_ms"])
        if not end_of_bucket:
            continue

        t_start = int(df.at[bucket_start, "timestamp_ms"])
        bucket_len = i - bucket_start

        if t_start in next_ts_map:
            t_end = int(next_ts_map[t_start])
            span_ms = t_end - t_start
        else:
            # Last bucket — extend by the median row spacing we've observed
            # so far. Falls back to 30 ms if we haven't gathered enough.
            median = int(sum(all_spacings) / len(all_spacings)) if all_spacings else 30
            span_ms = median * bucket_len

        if bucket_len > 1:
            step = span_ms / bucket_len
            for k in range(bucket_len):
                new_ts[bucket_start + k] = int(round(t_start + k * step))
            all_spacings.append(step)

        bucket_start = i

    df["timestamp_ms"] = new_ts
    dst.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(dst, index=False)

    return {
        "rows": len(df),
        "unique_before": len(unique_ts),
        "unique_after": df["timestamp_ms"].nunique(),
        "max_bucket_size": int(df.groupby(df["timestamp_ms"] // 1000).size().max()),
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    stats = repair(args.input, args.output)
    print(f"rows:            {stats['rows']}")
    print(f"unique ts before: {stats['unique_before']}")
    print(f"unique ts after:  {stats['unique_after']}")
    print(f"max rows/second:  {stats['max_bucket_size']}")
    print(f"wrote: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
