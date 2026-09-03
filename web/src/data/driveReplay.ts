import type { FusedResult } from "./types";

/**
 * Real-drive replay stream. Loads the actual Kalman pipeline output CSVs
 * from public/data/ (real 3.2 km drive in North Bengaluru, 2026-09-02)
 * and replays them as `fused_result` events at a demo-friendly rate.
 *
 * Also overlays an artificial GPS-outage window in the middle of the trip
 * — the raw-GPS emissions are suppressed during that window so the demo
 * viewer sees the DR-active pill fire naturally. The corrected-path line
 * keeps drawing (it's what the filter actually produced when GPS *was*
 * available), which is the "keeps tracking" story.
 *
 * We're not claiming we re-ran the filter with GPS blanked — that's a
 * separate exercise in `model/`. This is the pitch overlay.
 */

interface Options {
  onFusedResult: (r: FusedResult) => void;
  /** Playback speed multiplier. 1 = real-time, 5 = 5× faster. */
  speed?: number;
  /** Fraction of the trip [0..1] where the fake GPS outage starts. */
  outageStart?: number;
  /** Duration of the outage in seconds of trip-time. */
  outageDurS?: number;
}

interface CorrectedRow {
  timestamp_ms: number;
  lat: number;
  lon: number;
  heading_rad: number;
  std_e_m: number;
  std_n_m: number;
  cov_ee: number;
  cov_en: number;
  cov_nn: number;
}

interface RawRow {
  timestamp_ms: number;
  lat: number;
  lon: number;
}

export function startDriveReplay({
  onFusedResult,
  speed = 8,
  outageStart = 0.45,
  outageDurS = 30,
}: Options): () => void {
  let cancelled = false;
  let handle: ReturnType<typeof setTimeout> | null = null;

  void (async () => {
    const [correctedText, rawText] = await Promise.all([
      fetch("/data/drive_corrected.csv").then((r) => r.text()),
      fetch("/data/drive_raw_gps.csv").then((r) => r.text()),
    ]);
    if (cancelled) return;

    const corrected = parseCorrected(correctedText);
    const raw = parseRaw(rawText);
    if (corrected.length === 0) return;

    const tripStartMs = corrected[0].timestamp_ms;
    const tripEndMs = corrected[corrected.length - 1].timestamp_ms;
    const outageBegin = tripStartMs + (tripEndMs - tripStartMs) * outageStart;
    const outageEnd = outageBegin + outageDurS * 1000;

    // Build a Set of "GPS-used" timestamps: any corrected sample within ±100ms
    // of a raw GPS fix counts as gps_used (except during the fake outage).
    const rawTimestamps = raw.map((r) => r.timestamp_ms).sort((a, b) => a - b);

    // Pre-compute walltime schedule: each event fires at (t_trip - tripStart) / speed
    const walltimeStart = performance.now();

    let idx = 0;
    const emit = () => {
      if (cancelled || idx >= corrected.length) return;
      const c = corrected[idx];
      const tripElapsedMs = c.timestamp_ms - tripStartMs;
      const walltimeElapsedMs = performance.now() - walltimeStart;
      const targetWalltimeMs = tripElapsedMs / speed;

      if (walltimeElapsedMs < targetWalltimeMs) {
        handle = setTimeout(emit, targetWalltimeMs - walltimeElapsedMs);
        return;
      }

      const inOutage = c.timestamp_ms >= outageBegin && c.timestamp_ms < outageEnd;
      const nearFix = !inOutage && hasNearbyRawFix(c.timestamp_ms, rawTimestamps, 100);

      onFusedResult({
        state: "running",
        timestamp_ms: c.timestamp_ms,
        lat: c.lat,
        lon: c.lon,
        heading_rad: c.heading_rad,
        std_e_m: inOutage ? c.std_e_m + (c.timestamp_ms - outageBegin) / 1000 * 1.5 : c.std_e_m,
        std_n_m: inOutage ? c.std_n_m + (c.timestamp_ms - outageBegin) / 1000 * 1.2 : c.std_n_m,
        cov_ee: c.cov_ee,
        cov_en: c.cov_en,
        cov_nn: c.cov_nn,
        gps_used: nearFix,
      });

      idx++;
      handle = setTimeout(emit, 0);
    };
    emit();
  })();

  return () => {
    cancelled = true;
    if (handle) clearTimeout(handle);
  };
}

function parseCorrected(text: string): CorrectedRow[] {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const cols = header.split(",");
  const idx = {
    timestamp_ms: cols.indexOf("timestamp_ms"),
    lat: cols.indexOf("lat"),
    lon: cols.indexOf("lon"),
    heading_rad: cols.indexOf("heading_rad"),
    std_e_m: cols.indexOf("std_e_m"),
    std_n_m: cols.indexOf("std_n_m"),
  };
  const out: CorrectedRow[] = [];
  for (const row of rows) {
    const p = row.split(",");
    const stdE = parseFloat(p[idx.std_e_m]);
    const stdN = parseFloat(p[idx.std_n_m]);
    out.push({
      timestamp_ms: parseInt(p[idx.timestamp_ms], 10),
      lat: parseFloat(p[idx.lat]),
      lon: parseFloat(p[idx.lon]),
      heading_rad: parseFloat(p[idx.heading_rad]),
      std_e_m: stdE,
      std_n_m: stdN,
      cov_ee: stdE * stdE,
      cov_en: 0,
      cov_nn: stdN * stdN,
    });
  }
  return out;
}

function parseRaw(text: string): RawRow[] {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const cols = header.split(",");
  const idx = {
    timestamp_ms: cols.indexOf("timestamp_ms"),
    lat: cols.indexOf("lat"),
    lon: cols.indexOf("lon"),
  };
  return rows
    .map((row) => {
      const p = row.split(",");
      return {
        timestamp_ms: parseInt(p[idx.timestamp_ms], 10),
        lat: parseFloat(p[idx.lat]),
        lon: parseFloat(p[idx.lon]),
      };
    })
    .filter((r) => Number.isFinite(r.lat));
}

function hasNearbyRawFix(ts: number, sortedRawTs: number[], toleranceMs: number): boolean {
  // Binary search for the nearest raw timestamp
  let lo = 0;
  let hi = sortedRawTs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const diff = sortedRawTs[mid] - ts;
    if (Math.abs(diff) <= toleranceMs) return true;
    if (diff < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}
