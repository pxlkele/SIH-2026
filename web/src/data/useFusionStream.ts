import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { FusedResult, MatchedPathPoint } from "./types";
import { startDriveReplay } from "./driveReplay";
import { startLiveSensorStream, type LiveStreamStatus } from "./liveSensorStream";
import type { MotionMode } from "../motion/classifier";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string | undefined;

export type SourceMode = "live" | "replay" | "backend";

interface Options {
  onFusedResult?: (r: FusedResult) => void;
  onMatchedPath?: (points: MatchedPathPoint[]) => void;
  /** Which data source to use. Defaults to "replay" (drive playback). */
  mode?: SourceMode;
  /** Fires when live-sensor status changes. Only used when mode === "live". */
  onLiveStatus?: (s: LiveStreamStatus) => void;
  /** Fires when the motion-mode classifier updates. Only when mode === "live". */
  onMotionMode?: (mode: MotionMode, probs: Record<MotionMode, number>) => void;
}

/**
 * Data-source picker + fusion stream. Three modes:
 *   - "live":    real IMU + GPS from the phone, on-device Kalman
 *   - "replay":  play back the pre-recorded 3.2 km drive from public/data/
 *   - "backend": subscribe to Aleena's socket.io server (needs VITE_BACKEND_URL)
 *
 * Also derives DR-active state, GPS-lost timer, and drift-from-raw-GPS for HUDs.
 */
export function useFusionStream({
  onFusedResult,
  onMatchedPath,
  mode = "replay",
  onLiveStatus,
  onMotionMode,
}: Options = {}) {
  const socketRef = useRef<Socket | null>(null);
  const lastGpsUsedTsRef = useRef<number | null>(null);
  const lastRawGpsRef = useRef<{ lat: number; lon: number } | null>(null);

  const [latestFused, setLatestFused] = useState<FusedResult | null>(null);
  const [isDRActive, setIsDRActive] = useState(false);
  const [gpsLostSeconds, setGpsLostSeconds] = useState(0);
  const [driftMeters, setDriftMeters] = useState<number | null>(null);

  useEffect(() => {
    const handle = (r: FusedResult) => {
      onFusedResult?.(r);
      if (r.gps_used && r.lat != null && r.lon != null) {
        lastGpsUsedTsRef.current = r.timestamp_ms;
        lastRawGpsRef.current = { lat: r.lat, lon: r.lon };
      }
      if (lastRawGpsRef.current && r.lat != null && r.lon != null) {
        setDriftMeters(haversineMeters(r.lat, r.lon, lastRawGpsRef.current.lat, lastRawGpsRef.current.lon));
      }
      setLatestFused(r);
    };

    if (mode === "backend" && BACKEND_URL) {
      const socket = io(BACKEND_URL, { transports: ["websocket"] });
      socketRef.current = socket;
      socket.on("fused_result", handle);
      socket.on("matched_path", (pts: MatchedPathPoint[]) => onMatchedPath?.(pts));
      return () => {
        socket.disconnect();
        socketRef.current = null;
      };
    }

    if (mode === "live") {
      let stopFn: (() => void) | null = null;
      let cancelled = false;
      void startLiveSensorStream({
        onFusedResult: handle,
        onStatus: (s) => onLiveStatus?.(s),
        onMotionMode: (m, p) => onMotionMode?.(m, p),
      }).then((handle) => {
        if (cancelled) {
          handle?.stop();
          return;
        }
        stopFn = handle?.stop ?? null;
      });
      return () => {
        cancelled = true;
        stopFn?.();
      };
    }

    // Default: drive replay from public/data
    const stop = startDriveReplay({ onFusedResult: handle });
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const iv = setInterval(() => {
      const last = lastGpsUsedTsRef.current;
      const latest = latestFused?.timestamp_ms;
      if (last == null || latest == null) {
        setIsDRActive(false);
        setGpsLostSeconds(0);
        return;
      }
      const secs = Math.max(0, (latest - last) / 1000);
      setGpsLostSeconds(secs);
      setIsDRActive(secs > 2);
    }, 200);
    return () => clearInterval(iv);
  }, [latestFused]);

  return useMemo(
    () => ({ latestFused, isDRActive, gpsLostSeconds, driftMeters }),
    [latestFused, isDRActive, gpsLostSeconds, driftMeters],
  );
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_378_137;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
