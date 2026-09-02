import type { FusedResult } from "./types";

/**
 * Local mock stream — synthetic 60s scenario, ~30 Hz, with a 20-second GPS-loss
 * window from t=25s to t=45s. Origin at Cubbon Park, Bengaluru so the demo has
 * a recognisable backdrop even without real drive data.
 *
 * Mirrors what the actual model's synth generator produces, but generated
 * live in the browser so we don't need Aleena's backend running for UI work.
 */

interface Options {
  onFusedResult: (r: FusedResult) => void;
  tickHz?: number;
}

const ORIGIN_LAT = 12.9716;
const ORIGIN_LON = 77.5946;
const SPEED = 12;                    // m/s
const LOSS_START_S = 25;
const LOSS_END_S = 45;
const EARTH_R = 6_378_137;

export function startMockStream({ onFusedResult, tickHz = 30 }: Options): () => void {
  const dt = 1 / tickHz;
  let t = 0;
  let east = 0;
  let north = 0;
  const t0 = Date.now();

  const iv = setInterval(() => {
    t += dt;
    // Motion: straight for 20s, gentle right turn 20-35s, straight after
    let heading = 0;
    if (t >= 20 && t < 35) {
      heading = ((t - 20) / 15) * (Math.PI / 4);  // 45° turn over 15s
    } else if (t >= 35) {
      heading = Math.PI / 4;
    }
    east += SPEED * Math.sin(heading) * dt;
    north += SPEED * Math.cos(heading) * dt;

    const inOutage = t >= LOSS_START_S && t < LOSS_END_S;

    // Fake growing uncertainty during outage — real filter would compute this
    const secsSinceGps = inOutage ? t - LOSS_START_S : 0;
    const std = Math.max(3, 3 + secsSinceGps * 1.2);   // grows during outage
    const covEE = std * std;
    const covNN = std * std * 0.8;                     // elongated along heading
    const covEN = std * std * 0.3 * Math.sin(2 * heading);

    const { lat, lon } = enToLatLon(east, north);

    onFusedResult({
      state: "running",
      timestamp_ms: t0 + Math.floor(t * 1000),
      lat,
      lon,
      heading_rad: heading,
      std_e_m: std,
      std_n_m: Math.sqrt(covNN),
      cov_ee: covEE,
      cov_en: covEN,
      cov_nn: covNN,
      gps_used: !inOutage && Math.floor(t) !== Math.floor(t - dt),   // ~1 Hz GPS
    });

    if (t > 60) {
      clearInterval(iv);
    }
  }, dt * 1000);

  return () => clearInterval(iv);
}

function enToLatLon(east: number, north: number): { lat: number; lon: number } {
  const dLat = north / EARTH_R;
  const dLon = east / (EARTH_R * Math.cos((ORIGIN_LAT * Math.PI) / 180));
  return {
    lat: ORIGIN_LAT + (dLat * 180) / Math.PI,
    lon: ORIGIN_LON + (dLon * 180) / Math.PI,
  };
}
