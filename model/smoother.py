"""RTS (Rauch-Tung-Striebel) smoother for post-run trajectory refinement.

Same math as our online Kalman filter — but run twice: once forward through
the log, then backward. Each smoothed state uses information from ALL
samples (past AND future), which the online filter can't do because the
future hasn't happened yet.

Result: significantly tighter trajectory during GPS-outage segments,
because the smoother knows where GPS reacquired at the *end* of the outage
and blends that backwards into the outage window.

Usage:
    python -m model.smoother <input_log.csv> <output_smoothed.csv>

Or from Python:
    from smoother import smooth_log
    smoothed = smooth_log('data/real/ios_drive_2026-08-29.csv')

Only useful post-run (needs the whole log). Live demo uses the online
filter (SessionStepper). RTS is for the playback / "here's the definitive
trajectory" moment.
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from frames import ENUOrigin, device_accel_to_world, en_to_latlon, integrate_heading, latlon_to_en
from ingest import Sample, read_log
from kalman import KalmanConfig


@dataclass
class SmoothedRow:
    timestamp_ms: int
    lat: float
    lon: float
    heading_rad: float
    std_e_m: float
    std_n_m: float
    cov_ee: float
    cov_en: float
    cov_nn: float


def smooth_log(log_path: str | Path, cfg: KalmanConfig | None = None) -> list[SmoothedRow]:
    """Run forward Kalman + backward RTS smoother on a full log."""
    cfg = cfg or KalmanConfig()
    samples = list(read_log(log_path))

    fwd = _forward_pass(samples, cfg)
    if not fwd.records:
        return []
    smoothed_states = _rts_backward_pass(fwd)

    origin = fwd.origin
    out: list[SmoothedRow] = []
    for ts, heading, x_smooth, P_smooth in zip(
        fwd.timestamps, fwd.headings, smoothed_states.x_list, smoothed_states.P_list
    ):
        east, north = float(x_smooth[0]), float(x_smooth[1])
        lat, lon = en_to_latlon(east, north, origin)
        cov_ee = float(P_smooth[0, 0])
        cov_en = float(P_smooth[0, 1])
        cov_nn = float(P_smooth[1, 1])
        out.append(SmoothedRow(
            timestamp_ms=ts,
            lat=lat, lon=lon,
            heading_rad=heading,
            std_e_m=float(np.sqrt(max(cov_ee, 0.0))),
            std_n_m=float(np.sqrt(max(cov_nn, 0.0))),
            cov_ee=cov_ee, cov_en=cov_en, cov_nn=cov_nn,
        ))
    return out


# --- internals ---


@dataclass
class _ForwardResult:
    origin: ENUOrigin
    timestamps: list[int]
    headings: list[float]
    x_post: list[np.ndarray]     # state after update (or after predict if no GPS)
    P_post: list[np.ndarray]
    x_prior_next: list[np.ndarray]   # for step k, the prior at k+1 (from predicting k->k+1)
    P_prior_next: list[np.ndarray]
    F_at: list[np.ndarray]           # state transition matrix used from k to k+1
    records: bool = False


@dataclass
class _SmoothedStates:
    x_list: list[np.ndarray]
    P_list: list[np.ndarray]


def _forward_pass(samples: list[Sample], cfg: KalmanConfig) -> _ForwardResult:
    """Run the Kalman forward, capturing everything the backward pass needs.

    Bootstrap logic mirrors SessionStepper: first fix sets origin, second fix
    initialises state (position + velocity from position delta), then normal
    predict/update from there.
    """
    origin: ENUOrigin | None = None
    heading = 0.0
    first_fix: tuple[int, float, float] | None = None
    initialised = False

    x = np.zeros(4)
    P = np.diag([cfg.init_pos_std ** 2] * 2 + [cfg.init_vel_std ** 2] * 2)
    H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)

    timestamps: list[int] = []
    headings: list[float] = []
    x_post: list[np.ndarray] = []
    P_post: list[np.ndarray] = []
    x_prior_next: list[np.ndarray] = []
    P_prior_next: list[np.ndarray] = []
    F_at: list[np.ndarray] = []

    last_ts_ms: int | None = None

    for s in samples:
        if origin is None:
            if not s.has_gps:
                continue
            origin = ENUOrigin(lat_deg=s.gps_lat, lon_deg=s.gps_lon)
            first_fix = (s.timestamp_ms, 0.0, 0.0)
            last_ts_ms = s.timestamp_ms
            continue

        if not initialised:
            if s.has_gps:
                assert first_fix is not None
                east_m, north_m = latlon_to_en(s.gps_lat, s.gps_lon, origin)
                dt0 = (s.timestamp_ms - first_fix[0]) / 1000.0
                if dt0 > 0:
                    ve = (east_m - first_fix[1]) / dt0
                    vn = (north_m - first_fix[2]) / dt0
                    x = np.array([east_m, north_m, ve, vn])
                    initialised = True
                    last_ts_ms = s.timestamp_ms
                    timestamps.append(s.timestamp_ms)
                    headings.append(heading)
                    x_post.append(x.copy())
                    P_post.append(P.copy())
            continue

        assert last_ts_ms is not None
        dt = max(1e-6, (s.timestamp_ms - last_ts_ms) / 1000.0)
        last_ts_ms = s.timestamp_ms
        heading = integrate_heading(heading, s.gyro_z, dt)
        a_east, a_north = device_accel_to_world(s.accel_x, s.accel_y, heading)

        F = np.array([[1, 0, dt, 0],
                      [0, 1, 0, dt],
                      [0, 0, 1,  0],
                      [0, 0, 0,  1]], dtype=float)
        B = np.array([[0.5 * dt * dt, 0],
                      [0, 0.5 * dt * dt],
                      [dt, 0],
                      [0, dt]], dtype=float)
        sa2 = cfg.accel_process_std ** 2
        q_pp, q_pv, q_vv = 0.25 * dt ** 4 * sa2, 0.5 * dt ** 3 * sa2, dt ** 2 * sa2
        Q = np.array([[q_pp, 0, q_pv, 0],
                      [0, q_pp, 0, q_pv],
                      [q_pv, 0, q_vv, 0],
                      [0, q_pv, 0, q_vv]], dtype=float)

        # Predict: this F takes us from the PREVIOUS post state to the current prior.
        x_prior = F @ x + B @ np.array([a_east, a_north])
        P_prior = F @ P @ F.T + Q

        # Record the transition attached to the PREVIOUS step (k -> k+1).
        F_at.append(F)
        x_prior_next.append(x_prior.copy())
        P_prior_next.append(P_prior.copy())

        x, P = x_prior, P_prior

        if s.has_gps:
            east_m, north_m = latlon_to_en(s.gps_lat, s.gps_lon, origin)
            sigma = max(s.gps_accuracy_m if s.gps_accuracy_m is not None else 10.0, cfg.min_gps_std_m)
            R = np.diag([sigma ** 2, sigma ** 2])
            z = np.array([east_m, north_m])
            y = z - H @ x
            S = H @ P @ H.T + R
            K = P @ H.T @ np.linalg.inv(S)
            x = x + K @ y
            P = (np.eye(4) - K @ H) @ P

        timestamps.append(s.timestamp_ms)
        headings.append(heading)
        x_post.append(x.copy())
        P_post.append(P.copy())

    return _ForwardResult(
        origin=origin, timestamps=timestamps, headings=headings,
        x_post=x_post, P_post=P_post,
        x_prior_next=x_prior_next, P_prior_next=P_prior_next,
        F_at=F_at, records=bool(x_post),
    )


def _rts_backward_pass(fwd: _ForwardResult) -> _SmoothedStates:
    """Standard RTS recursion:

        G_k     = P_k^post @ F_k^T @ inv(P_{k+1}^prior)
        x_k^s   = x_k^post + G_k @ (x_{k+1}^s - x_{k+1}^prior)
        P_k^s   = P_k^post + G_k @ (P_{k+1}^s - P_{k+1}^prior) @ G_k^T

    Applied in reverse from the second-to-last step down to the first.
    """
    n = len(fwd.x_post)
    x_s: list[np.ndarray] = [fwd.x_post[i].copy() for i in range(n)]
    P_s: list[np.ndarray] = [fwd.P_post[i].copy() for i in range(n)]

    for k in range(n - 2, -1, -1):
        F = fwd.F_at[k]                  # transition used to predict k+1 from k
        P_prior_kp1 = fwd.P_prior_next[k]
        x_prior_kp1 = fwd.x_prior_next[k]
        G = fwd.P_post[k] @ F.T @ np.linalg.inv(P_prior_kp1)
        x_s[k] = fwd.x_post[k] + G @ (x_s[k + 1] - x_prior_kp1)
        P_s[k] = fwd.P_post[k] + G @ (P_s[k + 1] - P_prior_kp1) @ G.T

    return _SmoothedStates(x_list=x_s, P_list=P_s)


def _write_csv(path: Path, rows: list[SmoothedRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp_ms", "lat", "lon", "heading_rad",
                    "std_e_m", "std_n_m", "cov_ee", "cov_en", "cov_nn"])
        for r in rows:
            w.writerow([r.timestamp_ms, r.lat, r.lon, r.heading_rad,
                        r.std_e_m, r.std_n_m, r.cov_ee, r.cov_en, r.cov_nn])


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    rows = smooth_log(args.input)
    _write_csv(args.output, rows)
    print(f"smoothed {len(rows)} rows -> {args.output}")


if __name__ == "__main__":
    main()
