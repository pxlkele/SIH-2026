import type { FusedResult } from "./types";
import { getSession } from "./sessionStore";

/**
 * Play back a locally-recorded session as a stream of FusedResult events.
 * Same wire shape as driveReplay so /demo can swap sources without
 * touching consumers.
 *
 * Raw-GPS simulation: samples are stored at 1 Hz already, so every
 * sample is treated as gps_used=true — the raw side of the split
 * screen shows a dot every sample.
 */

interface Options {
  sessionId: string;
  onFusedResult: (r: FusedResult) => void;
  /** Playback speed multiplier. 1 = real-time, 8 = 8× faster. */
  speed?: number;
}

interface Handle {
  stop(): void;
}

export async function startSessionReplay({
  sessionId,
  onFusedResult,
  speed = 8,
}: Options): Promise<Handle | null> {
  const session = await getSession(sessionId);
  if (!session || session.samples.length === 0) return null;

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const walltimeStart = performance.now();
  let idx = 0;

  const tick = () => {
    if (cancelled || idx >= session.samples.length) return;
    const s = session.samples[idx];
    const tripElapsedMs = s.t;
    const walltimeElapsedMs = performance.now() - walltimeStart;
    const targetWalltimeMs = tripElapsedMs / speed;

    if (walltimeElapsedMs < targetWalltimeMs) {
      timer = setTimeout(tick, targetWalltimeMs - walltimeElapsedMs);
      return;
    }

    onFusedResult({
      state: "running",
      timestamp_ms: session.startedAt + s.t,
      lat: s.lat,
      lon: s.lon,
      heading_rad: null,
      std_e_m: 3,
      std_n_m: 3,
      cov_ee: 9,
      cov_en: 0,
      cov_nn: 9,
      gps_used: true,
    });

    idx++;
    timer = setTimeout(tick, 0);
  };
  tick();

  return {
    stop() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}
