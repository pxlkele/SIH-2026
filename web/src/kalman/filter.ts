/**
 * Linear Kalman filter for 2D position + velocity in local ENU. Port of
 * model/kalman.py — same equations, same state layout, same tuning knobs.
 * Kept deliberately literal so a Python and TS run on the same log produce
 * matching output.
 *
 *   State:        x = [E, N, vE, vN]^T           (metres, m/s)
 *   Control:      u = [aE, aN]^T                 (m/s^2, world frame)
 *   Measurement:  z = [E_gps, N_gps]^T           (metres)
 *
 *   Predict:  x = F x + B u;   P = F P F^T + Q
 *   Update:   y = z - H x;     S = H P H^T + R
 *             K = P H^T S^-1;  x = x + K y;   P = (I - K H) P
 */

import {
  diag4,
  eye4,
  mat22Inv,
  mat42MulVec2,
  mat44Add,
  mat44MulMat44,
  mat44MulVec4,
  mat44Sub,
  mat44Transpose,
  type Mat22,
  type Mat42,
  type Mat44,
  type Vec2,
  type Vec4,
} from "./matrix";

export interface KalmanConfig {
  /** Process noise. Higher = react to GPS faster, drift more between fixes.
   *  Tuned against real iPhone Core Motion IMU. Synth can go as low as 0.5. */
  accelProcessStd: number;
  initPosStd: number;
  initVelStd: number;
  /** Floor on GPS measurement std — guards against optimistic accuracy. */
  minGpsStdM: number;
}

export const DEFAULT_CONFIG: KalmanConfig = {
  accelProcessStd: 2.0,
  initPosStd: 10,
  initVelStd: 2,
  minGpsStdM: 3,
};

export class KalmanFilter2D {
  x: Vec4 = [0, 0, 0, 0];
  P: Mat44;
  private cfg: KalmanConfig;
  private initialised = false;

  constructor(cfg: KalmanConfig = DEFAULT_CONFIG) {
    this.cfg = cfg;
    this.P = diag4(
      cfg.initPosStd ** 2,
      cfg.initPosStd ** 2,
      cfg.initVelStd ** 2,
      cfg.initVelStd ** 2,
    );
  }

  initialise(east: number, north: number, ve = 0, vn = 0): void {
    this.x = [east, north, ve, vn];
    this.initialised = true;
  }

  get isInitialised(): boolean {
    return this.initialised;
  }

  /** Predict step. dt in seconds, control in world-frame m/s^2. */
  predict(dt: number, accelE: number, accelN: number): void {
    if (dt <= 0) return;

    const F: Mat44 = [
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const B: Mat42 = [
      [0.5 * dt * dt, 0],
      [0, 0.5 * dt * dt],
      [dt, 0],
      [0, dt],
    ];
    const u: Vec2 = [accelE, accelN];

    // x = F x + B u
    const Fx = mat44MulVec4(F, this.x);
    const Bu = mat42MulVec2(B, u);
    this.x = [Fx[0] + Bu[0], Fx[1] + Bu[1], Fx[2] + Bu[2], Fx[3] + Bu[3]];

    // Q — process noise derived from unmodeled acceleration std, discretised over dt
    const sa2 = this.cfg.accelProcessStd ** 2;
    const qpp = 0.25 * dt ** 4 * sa2;
    const qpv = 0.5 * dt ** 3 * sa2;
    const qvv = dt ** 2 * sa2;
    const Q: Mat44 = [
      [qpp, 0, qpv, 0],
      [0, qpp, 0, qpv],
      [qpv, 0, qvv, 0],
      [0, qpv, 0, qvv],
    ];

    // P = F P F^T + Q
    const FP = mat44MulMat44(F, this.P);
    const FPFt = mat44MulMat44(FP, mat44Transpose(F));
    this.P = mat44Add(FPFt, Q);
  }

  /** Measurement update from a GPS fix. accuracy in metres. */
  updateGps(eastMeas: number, northMeas: number, accuracyM: number): void {
    const sigma = Math.max(accuracyM, this.cfg.minGpsStdM);
    const R: Mat22 = [
      [sigma * sigma, 0],
      [0, sigma * sigma],
    ];

    // y = z - H x  (H picks first two rows)
    const y: Vec2 = [eastMeas - this.x[0], northMeas - this.x[1]];

    // S = H P H^T + R = top-left 2x2 of P + R
    const S: Mat22 = [
      [this.P[0][0] + R[0][0], this.P[0][1] + R[0][1]],
      [this.P[1][0] + R[1][0], this.P[1][1] + R[1][1]],
    ];
    const Sinv = mat22Inv(S);

    // K = P H^T S^-1  (P H^T is the first two columns of P)
    const K: [Vec2, Vec2, Vec2, Vec2] = [
      [
        this.P[0][0] * Sinv[0][0] + this.P[0][1] * Sinv[1][0],
        this.P[0][0] * Sinv[0][1] + this.P[0][1] * Sinv[1][1],
      ],
      [
        this.P[1][0] * Sinv[0][0] + this.P[1][1] * Sinv[1][0],
        this.P[1][0] * Sinv[0][1] + this.P[1][1] * Sinv[1][1],
      ],
      [
        this.P[2][0] * Sinv[0][0] + this.P[2][1] * Sinv[1][0],
        this.P[2][0] * Sinv[0][1] + this.P[2][1] * Sinv[1][1],
      ],
      [
        this.P[3][0] * Sinv[0][0] + this.P[3][1] * Sinv[1][0],
        this.P[3][0] * Sinv[0][1] + this.P[3][1] * Sinv[1][1],
      ],
    ];

    // x = x + K y
    for (let i = 0; i < 4; i++) {
      this.x[i] = this.x[i] + K[i][0] * y[0] + K[i][1] * y[1];
    }

    // P = (I - K H) P  — K H is 4x4 with only first two columns non-zero (K)
    const KH: Mat44 = [
      [K[0][0], K[0][1], 0, 0],
      [K[1][0], K[1][1], 0, 0],
      [K[2][0], K[2][1], 0, 0],
      [K[3][0], K[3][1], 0, 0],
    ];
    const IminusKH = mat44Sub(eye4, KH);
    this.P = mat44MulMat44(IminusKH, this.P);
  }

  position(): [number, number] {
    return [this.x[0], this.x[1]];
  }

  velocity(): [number, number] {
    return [this.x[2], this.x[3]];
  }

  positionStd(): [number, number] {
    return [Math.sqrt(Math.max(0, this.P[0][0])), Math.sqrt(Math.max(0, this.P[1][1]))];
  }

  positionCov(): [number, number, number] {
    return [this.P[0][0], this.P[0][1], this.P[1][1]];
  }
}
