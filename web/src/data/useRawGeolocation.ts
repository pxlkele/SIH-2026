import { useEffect, useRef, useState } from "react";

export interface RawFix {
  lat: number;
  lon: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  timestamp: number;
}

/**
 * Bare-bones geolocation watcher. Runs INDEPENDENTLY of the Kalman fusion
 * stream so the map always has a position to render even when the phone
 * has no motion sensors (desktop, tablets, older browsers) — in those
 * cases the fused stream never emits, but raw GPS still works.
 *
 * Emits null while waiting for permission / first fix.
 */
export function useRawGeolocation() {
  const [fix, setFix] = useState<RawFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setFix({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          headingDeg: pos.coords.heading,
          speedMps: pos.coords.speed,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        // Only permission-denied is a real error. Timeouts + unavailable
        // are transient — accuracy circle grows, that's the feedback.
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied");
        } else {
          console.warn("[geolocation] transient", err.code, err.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 },
    );

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  return { fix, error };
}
