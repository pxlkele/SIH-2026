/** Wire types matching the backend contract in model/README.md :: Inference API. */

export type SessionState = "waiting_first_fix" | "waiting_second_fix" | "running";

export interface FusedResult {
  state: SessionState;
  timestamp_ms: number;
  lat: number | null;
  lon: number | null;
  heading_rad: number | null;
  std_e_m: number | null;
  std_n_m: number | null;
  cov_ee: number | null;
  cov_en: number | null;
  cov_nn: number | null;
  gps_used: boolean;
}

export interface MatchedPathPoint {
  lat: number;
  lon: number;
}
