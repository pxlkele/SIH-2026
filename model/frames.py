"""Frame conversions for the dead-reckoning pipeline.

Local ENU tangent plane: origin is the first valid GPS fix. East/North in
metres. Equirectangular projection — accurate at the sub-km / few-km scales
we care about for a car demo.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6_378_137.0


@dataclass(frozen=True)
class ENUOrigin:
    lat_deg: float
    lon_deg: float

    @property
    def cos_lat(self) -> float:
        return math.cos(math.radians(self.lat_deg))


def latlon_to_en(lat_deg: float, lon_deg: float, origin: ENUOrigin) -> tuple[float, float]:
    """Equirectangular projection to local East/North metres."""
    d_lat = math.radians(lat_deg - origin.lat_deg)
    d_lon = math.radians(lon_deg - origin.lon_deg)
    east = EARTH_RADIUS_M * d_lon * origin.cos_lat
    north = EARTH_RADIUS_M * d_lat
    return east, north


def en_to_latlon(east_m: float, north_m: float, origin: ENUOrigin) -> tuple[float, float]:
    d_lat = north_m / EARTH_RADIUS_M
    d_lon = east_m / (EARTH_RADIUS_M * origin.cos_lat)
    return origin.lat_deg + math.degrees(d_lat), origin.lon_deg + math.degrees(d_lon)


def integrate_heading(heading_rad: float, gyro_z: float, dt: float) -> float:
    """Yaw-only integration. Assumes vehicle roughly level — fine for cars."""
    return _wrap_pi(heading_rad + gyro_z * dt)


def device_accel_to_world(accel_x: float, accel_y: float, heading_rad: float) -> tuple[float, float]:
    """Rotate horizontal device-frame acceleration to world-frame (E, N).

    heading_rad is measured East-of-North (standard nav convention).
    """
    c, s = math.cos(heading_rad), math.sin(heading_rad)
    east = accel_x * c - accel_y * s
    north = accel_x * s + accel_y * c
    return east, north


def _wrap_pi(a: float) -> float:
    return (a + math.pi) % (2 * math.pi) - math.pi
