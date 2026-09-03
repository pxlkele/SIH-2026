import type { FusedResult } from "./types";

/**
 * Real-drive replay stream. Loads the actual Kalman pipeline output CSVs
 * from public/data/ (real 12.3 km drive in North Bengaluru, 2026-09-03)
 * and replays them as `fused_result` events at a demo-friendly rate.
 *
 * Skips forward to `startAtTripSecs` so playback lands right on the
 * interesting bit — the largest real GPS gap in the trip is at t=1369s,
 * so default 1366 gives 3 seconds of clean tracking before the gap fires
 * (perfect for the pitch vlog).
 *
 * No artificial outage overlay any more — the real drive has real GPS
 * gaps (max 6s in this trip), which is more honest for the pitch.
 */

interface Options {
  onFusedResult: (r: FusedResult) => void;
  /** Playback speed multiplier. 1 = real-time, 5 = 5× faster. */
  speed?: number;
  /** Skip forward to this many seconds into the trip before starting. */
  startAtTripSecs?: number;
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

// Where the biggest real GPS gap in web/public/data/drive_raw_gps.csv sits.
// 6-second dropout at t=1369s. Starting 3s earlier gives the demo viewer
// enough context to see normal tracking → gap → dead-reckoning kicking in.
const DEFAULT_START_S = 1366;

export function startDriveReplay({
  onFusedResult,
  speed = 1,
  startAtTripSecs = DEFAULT_START_S,
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
    const skipMs = startAtTripSecs * 1000;
    const rawTimestamps = raw.map((r) => r.timestamp_ms).sort((a, b) => a - b);

    // Find the first corrected sample at or after our skip point
    let idx = 0;
    while (idx < corrected.length && corrected[idx].timestamp_ms - tripStartMs < skipMs) {
      idx++;
    }
    if (idx >= corrected.length) return;

    const playbackTripAnchorMs = corrected[idx].timestamp_ms;
    const walltimeStart = performance.now();

    const emit = () => {
      if (cancelled || idx >= corrected.length) return;
      const c = corrected[idx];
      const tripElapsedMs = c.timestamp_ms - playbackTripAnchorMs;
      const walltimeElapsedMs = performance.now() - walltimeStart;
      const targetWalltimeMs = tripElapsedMs / speed;

      if (walltimeElapsedMs < targetWalltimeMs) {
        handle = setTimeout(emit, targetWalltimeMs - walltimeElapsedMs);
        return;
      }

      const nearFix = hasNearbyRawFix(c.timestamp_ms, rawTimestamps, 100);

      onFusedResult({
        state: "running",
        timestamp_ms: c.timestamp_ms,
        lat: c.lat,
        lon: c.lon,
        heading_rad: c.heading_rad,
        std_e_m: c.std_e_m,
        std_n_m: c.std_n_m,
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
