"""Compare corrected_path.csv to ground_truth.csv.

Reports mean and max position error, split into three phases:
  before_loss  — while GPS is available up front
  during_loss  — pure dead-reckoning window
  after_loss   — GPS returns

Also reports a raw-GPS-only baseline (interpolated between fixes) so we can
say concretely how much better the fused path is.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import pandas as pd


LOSS_START_S = 25.0
LOSS_END_S = 45.0
EARTH_R = 6_378_137.0


def _en(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(lat0))
    east = EARTH_R * math.radians(lon - lon0) * cos_lat
    north = EARTH_R * math.radians(lat - lat0)
    return east, north


def _phase_stats(errs: pd.Series, label: str) -> str:
    if errs.empty:
        return f"  {label:12s}  (no samples)"
    return f"  {label:12s}  mean={errs.mean():6.2f} m   max={errs.max():6.2f} m   n={len(errs)}"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--truth", type=Path, default=Path("synth/ground_truth.csv"))
    p.add_argument("--fused", type=Path, default=Path("output/corrected_path.csv"))
    p.add_argument("--raw",   type=Path, default=Path("output/raw_gps_path.csv"))
    args = p.parse_args()

    truth = pd.read_csv(args.truth)
    fused = pd.read_csv(args.fused)
    raw = pd.read_csv(args.raw)

    lat0, lon0 = truth.iloc[0].lat, truth.iloc[0].lon
    t0_ms = truth.iloc[0].timestamp_ms

    def add_en(df):
        df = df.copy()
        df[["east_m", "north_m"]] = df.apply(
            lambda r: pd.Series(_en(r.lat, r.lon, lat0, lon0)), axis=1)
        df["t_s"] = (df.timestamp_ms - t0_ms) / 1000.0
        return df

    truth = add_en(truth)
    fused = add_en(fused)
    raw = add_en(raw)

    # Fused error vs. truth (row-aligned by timestamp — both are at IMU rate)
    merged = truth.merge(fused, on="timestamp_ms", suffixes=("_t", "_f"))
    merged["err_m"] = ((merged.east_m_t - merged.east_m_f) ** 2 +
                       (merged.north_m_t - merged.north_m_f) ** 2) ** 0.5
    merged["t_s"] = (merged.timestamp_ms - t0_ms) / 1000.0

    before = merged[merged.t_s < LOSS_START_S].err_m
    during = merged[(merged.t_s >= LOSS_START_S) & (merged.t_s < LOSS_END_S)].err_m
    after = merged[merged.t_s >= LOSS_END_S].err_m

    print("Fused (Kalman) position error vs. ground truth:")
    print(_phase_stats(before, "before_loss"))
    print(_phase_stats(during, "during_loss"))
    print(_phase_stats(after, "after_loss"))
    print(_phase_stats(merged.err_m, "overall"))

    # Raw-GPS baseline: linearly interpolate raw fixes across the loss window,
    # then measure error the same way. This is the "no dead reckoning" comparison.
    raw_sorted = raw.sort_values("t_s")
    truth_sorted = truth.sort_values("t_s")
    interp_east = pd.Series(
        _interp(truth_sorted.t_s.values, raw_sorted.t_s.values, raw_sorted.east_m.values))
    interp_north = pd.Series(
        _interp(truth_sorted.t_s.values, raw_sorted.t_s.values, raw_sorted.north_m.values))
    baseline_err = ((truth_sorted.east_m.values - interp_east.values) ** 2 +
                    (truth_sorted.north_m.values - interp_north.values) ** 2) ** 0.5
    baseline_err = pd.Series(baseline_err)
    baseline_err.index = truth_sorted.t_s.values

    b_before = baseline_err[baseline_err.index < LOSS_START_S]
    b_during = baseline_err[(baseline_err.index >= LOSS_START_S) & (baseline_err.index < LOSS_END_S)]
    b_after = baseline_err[baseline_err.index >= LOSS_END_S]

    print("\nRaw-GPS-only (linear interp across gap) baseline error:")
    print(_phase_stats(b_before, "before_loss"))
    print(_phase_stats(b_during, "during_loss"))
    print(_phase_stats(b_after, "after_loss"))
    print(_phase_stats(baseline_err, "overall"))


def _interp(xs, xps, fps):
    import numpy as np
    return np.interp(xs, xps, fps)


if __name__ == "__main__":
    main()
