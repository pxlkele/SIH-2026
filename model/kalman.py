"""Linear Kalman filter for 2D position + velocity in local ENU.

State:        x = [E, N, vE, vN]^T                       (metres, m/s)
Control:      u = [aE, aN]^T                             (m/s^2, world-frame)
Measurement:  z = [E_gps, N_gps]^T                       (metres, when GPS available)

Predict:  x = F x + B u          P = F P F^T + Q
Update:   y = z - H x            S = H P H^T + R
          K = P H^T S^-1          x = x + K y   P = (I - K H) P

Between GPS fixes we only predict — this IS the dead-reckoning behaviour.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class KalmanConfig:
    # Process noise: how much we trust the constant-velocity + IMU-control model.
    # Higher = filter reacts faster to GPS, drifts more between fixes.
    # 2.0 is tuned against real iPhone Core Motion IMU (see model/README.md).
    # Clean synth data can go as low as 0.5.
    accel_process_std: float = 2.0   # m/s^2, models un-modelled acceleration
    # Initial state uncertainty
    init_pos_std: float = 10.0        # m
    init_vel_std: float = 2.0         # m/s
    # Floor for GPS measurement std (guards against optimistic accuracy reports)
    min_gps_std_m: float = 3.0


class KalmanFilter2D:
    def __init__(self, cfg: KalmanConfig | None = None):
        self.cfg = cfg or KalmanConfig()
        self.x = np.zeros(4)                     # [E, N, vE, vN]
        self.P = np.diag([
            self.cfg.init_pos_std ** 2,
            self.cfg.init_pos_std ** 2,
            self.cfg.init_vel_std ** 2,
            self.cfg.init_vel_std ** 2,
        ])
        self.H = np.array([[1, 0, 0, 0],
                           [0, 1, 0, 0]], dtype=float)
        self._I = np.eye(4)
        self._initialised = False

    def initialise(self, east: float, north: float, ve: float = 0.0, vn: float = 0.0) -> None:
        self.x[:] = [east, north, ve, vn]
        self._initialised = True

    @property
    def initialised(self) -> bool:
        return self._initialised

    def predict(self, dt: float, accel_e: float, accel_n: float) -> None:
        if dt <= 0:
            return
        F = np.array([[1, 0, dt, 0],
                      [0, 1, 0, dt],
                      [0, 0, 1,  0],
                      [0, 0, 0,  1]], dtype=float)
        B = np.array([[0.5 * dt * dt, 0],
                      [0, 0.5 * dt * dt],
                      [dt, 0],
                      [0, dt]], dtype=float)
        u = np.array([accel_e, accel_n])
        self.x = F @ self.x + B @ u

        # Q derived from unmodeled acceleration std, discretised over dt.
        sa2 = self.cfg.accel_process_std ** 2
        q_pp = 0.25 * dt ** 4 * sa2
        q_pv = 0.5 * dt ** 3 * sa2
        q_vv = dt ** 2 * sa2
        Q = np.array([[q_pp, 0,    q_pv, 0],
                      [0,    q_pp, 0,    q_pv],
                      [q_pv, 0,    q_vv, 0],
                      [0,    q_pv, 0,    q_vv]], dtype=float)
        self.P = F @ self.P @ F.T + Q

    def update_gps(self, east_meas: float, north_meas: float, accuracy_m: float) -> None:
        sigma = max(accuracy_m, self.cfg.min_gps_std_m)
        R = np.diag([sigma ** 2, sigma ** 2])
        z = np.array([east_meas, north_meas])
        y = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        self.P = (self._I - K @ self.H) @ self.P

    def position(self) -> tuple[float, float]:
        return float(self.x[0]), float(self.x[1])

    def velocity(self) -> tuple[float, float]:
        return float(self.x[2]), float(self.x[3])

    def position_std(self) -> tuple[float, float]:
        return float(np.sqrt(self.P[0, 0])), float(np.sqrt(self.P[1, 1]))
