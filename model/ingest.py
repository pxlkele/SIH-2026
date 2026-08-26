"""CSV reader for the locked sensor schema.

Preserves GPS nulls — do NOT forward-fill. Downstream code must distinguish
real fixes from gaps (this is core to the dead-reckoning behaviour).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import pandas as pd


SCHEMA_COLUMNS = [
    "timestamp_ms",
    "accel_x", "accel_y", "accel_z",
    "gyro_x", "gyro_y", "gyro_z",
    "gps_lat", "gps_lon", "gps_accuracy_m",
]


@dataclass
class Sample:
    timestamp_ms: int
    accel_x: float
    accel_y: float
    accel_z: float
    gyro_x: float
    gyro_y: float
    gyro_z: float
    gps_lat: float | None
    gps_lon: float | None
    gps_accuracy_m: float | None

    @property
    def has_gps(self) -> bool:
        return self.gps_lat is not None and self.gps_lon is not None


def read_log(path: str | Path) -> Iterator[Sample]:
    df = pd.read_csv(path)
    missing = [c for c in SCHEMA_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Log missing required columns: {missing}")
    df = df.sort_values("timestamp_ms", kind="stable")

    for row in df.itertuples(index=False):
        yield Sample(
            timestamp_ms=int(row.timestamp_ms),
            accel_x=float(row.accel_x),
            accel_y=float(row.accel_y),
            accel_z=float(row.accel_z),
            gyro_x=float(row.gyro_x),
            gyro_y=float(row.gyro_y),
            gyro_z=float(row.gyro_z),
            gps_lat=_none_if_nan(row.gps_lat),
            gps_lon=_none_if_nan(row.gps_lon),
            gps_accuracy_m=_none_if_nan(row.gps_accuracy_m),
        )


def _none_if_nan(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f  # NaN check
