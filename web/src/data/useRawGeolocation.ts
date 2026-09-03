import { useCallback, useEffect, useRef, useState } from "react";

export interface RawFix {
  lat: number;
  lon: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  timestamp: number;
}

export type PermissionState = "unknown" | "granted" | "denied" | "prompt";

/**
 * Geolocation watcher.
 *
 *   fix           — latest raw GPS fix, or null until first success
 *   error         — human-readable error (denied only; transient errors quiet)
 *   permission    — best-effort permission state (via navigator.permissions
 *                   when supported, else inferred from watch results)
 *   isRequesting  — true while a fresh getCurrentPosition() is in flight
 *   requestFresh  — force a fresh fix + trigger the browser prompt again
 *
 * On mount we immediately kick off both `watchPosition` (continuous) AND
 * `getCurrentPosition` (one-shot). The one-shot is what actually surfaces
 * the browser permission prompt on many browsers if it hasn't been seen
 * before — watchPosition can be lazier about prompting.
 */
export function useRawGeolocation() {
  const [fix, setFix] = useState<RawFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [isRequesting, setIsRequesting] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const applyPos = (pos: GeolocationPosition) => {
    setError(null);
    setPermission("granted");
    setFix({
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      headingDeg: pos.coords.heading,
      speedMps: pos.coords.speed,
      timestamp: pos.timestamp,
    });
  };

  const applyErr = (err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setError("Location permission denied — enable in your browser settings.");
      setPermission("denied");
    } else {
      console.warn("[geolocation] transient", err.code, err.message);
    }
  };

  const requestFresh = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    setIsRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPos(pos);
        setIsRequesting(false);
      },
      (err) => {
        applyErr(err);
        setIsRequesting(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported in this browser");
      return;
    }

    // Ask the Permissions API up front — supported in Chrome / Edge / newer
    // Safari. Tells us whether the browser has an existing denial we should
    // surface even before any position request fires.
    const anyNav = navigator as any;
    if (anyNav.permissions?.query) {
      anyNav.permissions
        .query({ name: "geolocation" })
        .then((status: PermissionStatus) => {
          setPermission(status.state as PermissionState);
          status.onchange = () => setPermission(status.state as PermissionState);
        })
        .catch(() => {});
    }

    // Kick off the one-shot: this surfaces the permission prompt on most
    // browsers if it hasn't been shown, and gives us an initial fix fast.
    requestFresh();

    // Continuous watch for updates.
    watchIdRef.current = navigator.geolocation.watchPosition(applyPos, applyErr, {
      enableHighAccuracy: true,
      maximumAge: 500,
      timeout: 15000,
    });

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [requestFresh]);

  return { fix, error, permission, isRequesting, requestFresh };
}
