/**
 * Streaming stepper — one sample in, one FusedResult out. Port of
 * model/stepper.py :: SessionStepper.
 *
 * Bootstrap lifecycle mirrors the Python:
 *   1. samples with no GPS before the first fix are ignored
 *   2. first GPS fix sets the ENU origin
 *   3. second GPS fix bootstraps initial velocity from the position delta;
 *      filter goes RUNNING
 */

import type { FusedResult, SessionState } from "../data/types";
import {
  deviceAccelToWorld,
  enToLatLon,
  integrateHeading,
  latLonToEN,
  makeOrigin,
  type ENUOrigin,
} from "./frames";
import { DEFAULT_CONFIG, KalmanFilter2D, type KalmanConfig } from "./filter";

export interface Sample {
  timestampMs: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  gpsLat: number | null;
  gpsLon: number | null;
  gpsAccuracyM: number | null;
}

const hasGps = (s: Sample): boolean => s.gpsLat !== null && s.gpsLon !== null;

export class SessionStepper {
  private kf: KalmanFilter2D;
  private origin: ENUOrigin | null = null;
  private heading = 0;
  private lastTsMs: number | null = null;
  private firstFix: { tsMs: number; east: number; north: number } | null = null;
  private state: SessionState = "waiting_first_fix";

  constructor(cfg: KalmanConfig = DEFAULT_CONFIG) {
    this.kf = new KalmanFilter2D(cfg);
  }

  step(s: Sample): FusedResult {
    if (this.state === "waiting_first_fix") return this.awaitFirstFix(s);
    if (this.state === "waiting_second_fix") return this.awaitSecondFix(s);
    return this.run(s);
  }

  private awaitFirstFix(s: Sample): FusedResult {
    if (!hasGps(s)) return this.idle(s.timestampMs);
    this.origin = makeOrigin(s.gpsLat!, s.gpsLon!);
    this.firstFix = { tsMs: s.timestampMs, east: 0, north: 0 };
    this.lastTsMs = s.timestampMs;
    this.state = "waiting_second_fix";
    return this.idle(s.timestampMs, true);
  }

  private awaitSecondFix(s: Sample): FusedResult {
    if (!hasGps(s)) return this.idle(s.timestampMs);
    const [eastM, northM] = latLonToEN(s.gpsLat!, s.gpsLon!, this.origin!);
    const dt = (s.timestampMs - this.firstFix!.tsMs) / 1000;
    if (dt <= 0) return this.idle(s.timestampMs);
    const ve = (eastM - this.firstFix!.east) / dt;
    const vn = (northM - this.firstFix!.north) / dt;
    this.kf.initialise(eastM, northM, ve, vn);
    this.lastTsMs = s.timestampMs;
    this.state = "running";
    return this.emit(s.timestampMs, true);
  }

  private run(s: Sample): FusedResult {
    const dt = Math.max(0, (s.timestampMs - (this.lastTsMs ?? s.timestampMs)) / 1000);
    this.lastTsMs = s.timestampMs;
    this.heading = integrateHeading(this.heading, s.gyroZ, dt);
    const [aE, aN] = deviceAccelToWorld(s.accelX, s.accelY, this.heading);
    this.kf.predict(dt, aE, aN);

    let gpsUsed = false;
    if (hasGps(s)) {
      const [eastM, northM] = latLonToEN(s.gpsLat!, s.gpsLon!, this.origin!);
      this.kf.updateGps(eastM, northM, s.gpsAccuracyM ?? 10);
      gpsUsed = true;
    }
    return this.emit(s.timestampMs, gpsUsed);
  }

  private emit(tsMs: number, gpsUsed: boolean): FusedResult {
    const [east, north] = this.kf.position();
    const [lat, lon] = enToLatLon(east, north, this.origin!);
    const [stdE, stdN] = this.kf.positionStd();
    const [covEE, covEN, covNN] = this.kf.positionCov();
    return {
      state: this.state,
      timestamp_ms: tsMs,
      lat,
      lon,
      heading_rad: this.heading,
      std_e_m: stdE,
      std_n_m: stdN,
      cov_ee: covEE,
      cov_en: covEN,
      cov_nn: covNN,
      gps_used: gpsUsed,
    };
  }

  private idle(tsMs: number, gpsUsed = false): FusedResult {
    return {
      state: this.state,
      timestamp_ms: tsMs,
      lat: null,
      lon: null,
      heading_rad: null,
      std_e_m: null,
      std_n_m: null,
      cov_ee: null,
      cov_en: null,
      cov_nn: null,
      gps_used: gpsUsed,
    };
  }
}
