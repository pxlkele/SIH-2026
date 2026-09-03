/**
 * Live sensor stream: subscribes to the phone's IMU (`DeviceMotionEvent`) +
 * GPS (`navigator.geolocation.watchPosition`), fuses them through the
 * TypeScript Kalman filter, and emits FusedResult events at IMU rate.
 *
 * Runs entirely on-device. No backend, no network required for the fusion
 * itself. Map tiles + routing still need internet unless pre-cached.
 *
 * Prerequisites at runtime:
 *   - HTTPS origin (or localhost). Chrome + iOS both refuse DeviceMotion / GPS otherwise.
 *   - User grants motion + location permissions on first use.
 *   - `requestPermission()` on iOS 13+ must be called from a user gesture.
 */

import { SessionStepper, type Sample } from "../kalman/stepper";
import type { FusedResult } from "./types";

export type LiveStreamStatus =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "running"; imuHz: number; gpsFixes: number }
  | { kind: "error"; message: string };

interface Options {
  onFusedResult: (r: FusedResult) => void;
  onStatus?: (s: LiveStreamStatus) => void;
}

interface Handle {
  stop(): void;
}

export async function startLiveSensorStream({
  onFusedResult,
  onStatus,
}: Options): Promise<Handle | null> {
  onStatus?.({ kind: "requesting" });

  if (!("geolocation" in navigator)) {
    onStatus?.({ kind: "error", message: "Geolocation API not available" });
    return null;
  }
  if (typeof DeviceMotionEvent === "undefined") {
    onStatus?.({ kind: "error", message: "DeviceMotion API not available" });
    return null;
  }

  // iOS 13+ requires an explicit permission request, and it must happen
  // from inside a user gesture (button click). Android silently allows.
  const anyDME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<PermissionState> };
  if (typeof anyDME.requestPermission === "function") {
    try {
      const state = await anyDME.requestPermission();
      if (state !== "granted") {
        onStatus?.({ kind: "error", message: "Motion permission denied" });
        return null;
      }
    } catch (e) {
      onStatus?.({ kind: "error", message: (e as Error).message });
      return null;
    }
  }

  const stepper = new SessionStepper();
  let imuSamples = 0;
  let gpsFixes = 0;
  let lastStatusTs = 0;

  // GPS state — updated by watchPosition, consumed on the next IMU tick
  let pendingGps: { lat: number; lon: number; accuracyM: number; consumed: boolean } | null = null;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      pendingGps = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        consumed: false,
      };
      gpsFixes++;
    },
    (err) => {
      onStatus?.({ kind: "error", message: `GPS error: ${err.message}` });
    },
    { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 },
  );

  const handleMotion = (e: DeviceMotionEvent) => {
    const ax = e.acceleration?.x;
    const ay = e.acceleration?.y;
    const az = e.acceleration?.z;
    const rr = e.rotationRate;
    if (ax == null || ay == null || az == null || !rr) return;

    // e.acceleration is gravity-removed by the browser (iOS: from Core Motion,
    // Android Chrome: from linear accel sensor). Values in m/s^2 already —
    // NOT G's like the iOS SensorLog CSV. Sanity: |a| should be a few m/s^2
    // during normal driving, not ~9.8.
    //
    // Rotation rates in degrees/sec (spec) — convert to rad/s to match filter.
    const DEG2RAD = Math.PI / 180;

    const now = Date.now();
    const useGps = pendingGps && !pendingGps.consumed;
    const sample: Sample = {
      timestampMs: now,
      accelX: ax,
      accelY: ay,
      accelZ: az,
      gyroX: (rr.alpha ?? 0) * DEG2RAD,
      gyroY: (rr.beta ?? 0) * DEG2RAD,
      gyroZ: (rr.gamma ?? 0) * DEG2RAD,
      gpsLat: useGps ? pendingGps!.lat : null,
      gpsLon: useGps ? pendingGps!.lon : null,
      gpsAccuracyM: useGps ? pendingGps!.accuracyM : null,
    };
    if (useGps) pendingGps!.consumed = true;

    const result = stepper.step(sample);
    onFusedResult(result);
    imuSamples++;

    if (now - lastStatusTs > 1000) {
      // Rough IMU rate for the last second — samples/elapsed-ms×1000, capped.
      onStatus?.({
        kind: "running",
        imuHz: Math.round(imuSamples / ((now - (lastStatusTs || now - 1000)) / 1000)) || 0,
        gpsFixes,
      });
      lastStatusTs = now;
      imuSamples = 0;
    }
  };

  window.addEventListener("devicemotion", handleMotion);
  onStatus?.({ kind: "running", imuHz: 0, gpsFixes: 0 });

  return {
    stop() {
      window.removeEventListener("devicemotion", handleMotion);
      navigator.geolocation.clearWatch(watchId);
      onStatus?.({ kind: "idle" });
    },
  };
}

/**
 * Cheap detection for whether we even *have* the APIs — used to gate the UI.
 * (Does not request permissions.)
 */
export function liveSensorsAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "geolocation" in navigator &&
    typeof DeviceMotionEvent !== "undefined"
  );
}
