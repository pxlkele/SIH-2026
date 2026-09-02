import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { FusedResult, MatchedPathPoint } from "./types";
import { startMockStream } from "./mockStream";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string | undefined;
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "1" || !BACKEND_URL;

interface Options {
  onFusedResult?: (r: FusedResult) => void;
  onMatchedPath?: (points: MatchedPathPoint[]) => void;
}

/**
 * Subscribes to Aleena's backend events (or a local mock stream if
 * VITE_BACKEND_URL isn't set). Handles reconnect. React re-renders only when
 * derived summary state changes (isDRActive, gpsLostSeconds, etc.) — the
 * per-event onFusedResult callback runs at full frequency without touching
 * React state (that's for the map's imperative updates).
 */
export function useFusionStream({ onFusedResult, onMatchedPath }: Options = {}) {
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

    if (USE_MOCK) {
      const stop = startMockStream({ onFusedResult: handle });
      return () => stop();
    }

    const socket = io(BACKEND_URL!, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("fused_result", handle);
    socket.on("matched_path", (pts: MatchedPathPoint[]) => onMatchedPath?.(pts));
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update DR-active + GPS-lost timer every 200ms based on last gps_used sample.
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
      setIsDRActive(secs > 2);   // 2s threshold before we call it a real outage
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
