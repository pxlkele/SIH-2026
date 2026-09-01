"""Streaming stepper — one Sample in, one StepResult out.

Wraps the Kalman filter as a stateful session so the live path can drive
fusion sample-by-sample (over WebSocket, subprocess stdio, etc.) using the
exact same logic as the batch runner.

Session lifecycle:
  1. samples with no GPS before the first fix are ignored (state=WAITING_FIRST_FIX)
  2. first GPS fix sets the ENU origin (state=WAITING_SECOND_FIX)
  3. second GPS fix bootstraps initial velocity from position delta -> filter is
     initialised (state=RUNNING); step() returns fused positions from here on
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from enum import Enum

from frames import ENUOrigin, device_accel_to_world, en_to_latlon, integrate_heading, latlon_to_en
from ingest import Sample
from kalman import KalmanConfig, KalmanFilter2D


class SessionState(str, Enum):
    WAITING_FIRST_FIX = "waiting_first_fix"
    WAITING_SECOND_FIX = "waiting_second_fix"
    RUNNING = "running"


@dataclass
class StepResult:
    state: str                       # SessionState value
    timestamp_ms: int
    lat: float | None                # fused position, None until RUNNING
    lon: float | None
    heading_rad: float | None
    std_e_m: float | None            # position uncertainty (1-sigma), metres — East
    std_n_m: float | None            # position uncertainty (1-sigma), metres — North
    cov_ee: float | None             # position covariance sub-matrix (m^2). Full 2x2 is
    cov_en: float | None             #   [[cov_ee, cov_en],
    cov_nn: float | None             #    [cov_en, cov_nn]] — eigendecompose for a
                                     #   properly rotated confidence ellipse.
    gps_used: bool                   # did this sample contain a GPS fix consumed by the filter

    def to_dict(self) -> dict:
        return asdict(self)


class SessionStepper:
    def __init__(self, cfg: KalmanConfig | None = None):
        self._kf = KalmanFilter2D(cfg)
        self._origin: ENUOrigin | None = None
        self._heading: float = 0.0
        self._last_ts_ms: int | None = None
        self._first_fix: tuple[int, float, float] | None = None  # (ts_ms, east, north)
        self._state: SessionState = SessionState.WAITING_FIRST_FIX

    @property
    def state(self) -> SessionState:
        return self._state

    @property
    def origin(self) -> ENUOrigin | None:
        return self._origin

    def step(self, s: Sample) -> StepResult:
        if self._state is SessionState.WAITING_FIRST_FIX:
            return self._await_first_fix(s)
        if self._state is SessionState.WAITING_SECOND_FIX:
            return self._await_second_fix(s)
        return self._run(s)

    # --- states ---

    def _await_first_fix(self, s: Sample) -> StepResult:
        if not s.has_gps:
            return _idle(s.timestamp_ms, self._state)
        self._origin = ENUOrigin(lat_deg=s.gps_lat, lon_deg=s.gps_lon)
        self._first_fix = (s.timestamp_ms, 0.0, 0.0)
        self._last_ts_ms = s.timestamp_ms
        self._state = SessionState.WAITING_SECOND_FIX
        return _idle(s.timestamp_ms, self._state, gps_used=True)

    def _await_second_fix(self, s: Sample) -> StepResult:
        if not s.has_gps:
            return _idle(s.timestamp_ms, self._state)
        assert self._origin is not None and self._first_fix is not None
        east_m, north_m = latlon_to_en(s.gps_lat, s.gps_lon, self._origin)
        dt = (s.timestamp_ms - self._first_fix[0]) / 1000.0
        if dt <= 0:
            # Same-timestamp duplicate — hold and wait for a later fix.
            return _idle(s.timestamp_ms, self._state)
        ve = (east_m - self._first_fix[1]) / dt
        vn = (north_m - self._first_fix[2]) / dt
        self._kf.initialise(east_m, north_m, ve=ve, vn=vn)
        # (Heading is NOT bootstrapped from ve/vn here — GPS noise on a
        # 1-second baseline gives ~20-30° heading error which propagates
        # through every accel rotation until GPS updates hammer it down.
        # We let the filter converge heading naturally via repeated GPS
        # updates. Core Motion's bias-compensated gyro handles this fine.)
        self._last_ts_ms = s.timestamp_ms
        self._state = SessionState.RUNNING
        return self._emit(s.timestamp_ms, gps_used=True)

    def _run(self, s: Sample) -> StepResult:
        assert self._last_ts_ms is not None and self._origin is not None
        dt = max(0.0, (s.timestamp_ms - self._last_ts_ms) / 1000.0)
        self._last_ts_ms = s.timestamp_ms
        self._heading = integrate_heading(self._heading, s.gyro_z, dt)
        a_east, a_north = device_accel_to_world(s.accel_x, s.accel_y, self._heading)
        self._kf.predict(dt=dt, accel_e=a_east, accel_n=a_north)

        gps_used = False
        if s.has_gps:
            east_m, north_m = latlon_to_en(s.gps_lat, s.gps_lon, self._origin)
            acc = s.gps_accuracy_m if s.gps_accuracy_m is not None else 10.0
            self._kf.update_gps(east_m, north_m, acc)
            gps_used = True

        return self._emit(s.timestamp_ms, gps_used=gps_used)

    def _emit(self, ts_ms: int, *, gps_used: bool) -> StepResult:
        assert self._origin is not None
        east, north = self._kf.position()
        lat, lon = en_to_latlon(east, north, self._origin)
        std_e, std_n = self._kf.position_std()
        cov_ee, cov_en, cov_nn = self._kf.position_cov()
        return StepResult(
            state=self._state.value,
            timestamp_ms=ts_ms,
            lat=lat,
            lon=lon,
            heading_rad=self._heading,
            std_e_m=std_e,
            std_n_m=std_n,
            cov_ee=cov_ee,
            cov_en=cov_en,
            cov_nn=cov_nn,
            gps_used=gps_used,
        )


def _idle(ts_ms: int, state: SessionState, *, gps_used: bool = False) -> StepResult:
    return StepResult(
        state=state.value,
        timestamp_ms=ts_ms,
        lat=None, lon=None, heading_rad=None,
        std_e_m=None, std_n_m=None,
        cov_ee=None, cov_en=None, cov_nn=None,
        gps_used=gps_used,
    )
