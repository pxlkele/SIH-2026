import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Crosshair, Loader2, MapPinOff, Search, Signal, SignalZero } from "lucide-react";
import MapView, { type MapViewHandle } from "../map/MapView";
import { MapStyleToggle } from "../map/MapStyleToggle";
import { useFusionStream } from "../data/useFusionStream";
import { useRawGeolocation } from "../data/useRawGeolocation";
import { SessionRecorder } from "../data/sessionStore";
import type { MotionMode } from "../motion/classifier";
import { useNavigation } from "../nav/useNavigation";
import { NavSearch } from "../nav/NavSearch";
import { NavDirectionsPanel } from "../nav/NavDirectionsPanel";
import { DestinationPreview } from "../nav/DestinationPreview";
import { Wordmark } from "../components/Logo";
import { Button, LinkButton, Panel } from "../components/ui";

/**
 * `/app` — the interactive product view.
 *
 *   - Raw geolocation (via useRawGeolocation) is the definitive current
 *     position. On desktop it's our only source; on a phone with motion
 *     sensors, the Kalman fusion overlays a smoothed path on top.
 *   - Live IMU + GPS stream via useFusionStream draws the corrected line
 *     and uncertainty ellipse — but the *map centering* + nav routing
 *     never blocks on it. Presets work as soon as GPS gives a fix.
 */
export default function MainApp() {
  const mapRef = useRef<MapViewHandle>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [userMovedMap, setUserMovedMap] = useState(false);
  const [motionMode, setMotionMode] = useState<MotionMode | null>(null);
  // Selected-but-not-yet-navigating destination. Google-Maps flow: tap a
  // place → preview card with "Directions" → confirm to actually navigate.
  const [pendingDest, setPendingDest] = useState<{ name: string; lat: number; lon: number; presetSlug?: string } | null>(null);

  // Session recorder — starts when the user begins a navigation, stops
  // when they arrive/cancel. Logs 1 Hz samples locally to IndexedDB.
  const recorderRef = useRef<SessionRecorder | null>(null);
  const motionModeRef = useRef<MotionMode | null>(null);
  useEffect(() => {
    motionModeRef.current = motionMode;
  }, [motionMode]);

  // Definitive current position — always driven by raw geolocation so it
  // works on desktop too.
  const { fix: rawFix, error: geoError, permission: geoPermission, isRequesting: geoLoading, requestFresh: requestFreshFix } = useRawGeolocation();

  // Fused stream draws the corrected path + ellipse (mobile only in practice)
  const { latestFused, gpsBlocked, setGpsBlocked } = useFusionStream({
    mode: "live",
    onFusedResult: (r) => {
      mapRef.current?.pushFusedPoint(r);
      // Log to the active session recorder if one exists
      if (r.lat != null && r.lon != null) {
        recorderRef.current?.sample(r.lat, r.lon, motionModeRef.current ?? undefined);
      }
    },
    onMotionMode: (m) => setMotionMode(m),
  });

  // If fused isn't producing (desktop, no motion sensors), also log raw fixes
  useEffect(() => {
    if (rawFix && recorderRef.current && (!latestFused?.lat || !latestFused?.lon)) {
      recorderRef.current.sample(rawFix.lat, rawFix.lon, motionModeRef.current ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFix]);

  // Recenter-button subscription
  useEffect(() => {
    const unsubscribe = mapRef.current?.onUserInteractionChange(setUserMovedMap);
    return () => unsubscribe?.();
  }, []);

  // (Raw-fix panning handled below via lastFixTimestampRef so we only
  //  react to actually-new fixes, not stale ones on re-render.)

  // Fused samples: full follow-vehicle (heading-up tilt look).
  useEffect(() => {
    if (latestFused?.lat != null && latestFused?.lon != null) {
      mapRef.current?.followVehicle(
        latestFused.lat,
        latestFused.lon,
        latestFused.heading_rad ?? 0,
      );
    }
  }, [latestFused]);

  // Position handed to the nav module — fused wins if we have it, else raw.
  const currentPos = useMemo(() => {
    if (latestFused?.lat != null && latestFused?.lon != null) {
      return { lat: latestFused.lat, lon: latestFused.lon };
    }
    if (rawFix) return { lat: rawFix.lat, lon: rawFix.lon };
    return null;
  }, [latestFused, rawFix]);

  const nav = useNavigation({ currentPos });

  useEffect(() => {
    mapRef.current?.setRoute(nav.route ? nav.route.geometry : null);
  }, [nav.route]);

  useEffect(() => {
    mapRef.current?.setDestinationMarker(
      nav.destination ? [nav.destination.lon, nav.destination.lat] : null,
    );
  }, [nav.destination]);

  // Session lifecycle: start recorder when a destination is set, end when
  // it's cleared. Persists automatically to IndexedDB.
  useEffect(() => {
    if (nav.destination && !recorderRef.current) {
      recorderRef.current = new SessionRecorder({
        name: nav.destination.name,
        lat: nav.destination.lat,
        lon: nav.destination.lon,
      });
      console.log("[session] started", recorderRef.current.id);
    } else if (!nav.destination && recorderRef.current) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      void rec.end().then((s) => console.log("[session] ended", s.id, `${s.samples.length} samples`));
    }
  }, [nav.destination]);

  // Also end the session cleanly on unmount (user navigates away)
  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        void recorderRef.current.end();
        recorderRef.current = null;
      }
    };
  }, []);

  // Recenter handler. Immediately snaps to any cached position for
  // instant feedback, then triggers a fresh geolocation request via the
  // shared hook (which handles permission state, spinner, and errors).
  const handleRecenter = () => {
    if (rawFix) mapRef.current?.panTo(rawFix.lat, rawFix.lon);
    mapRef.current?.recenter();
    requestFreshFix();
  };

  // Raw-fix camera driver. When we're actively navigating, we want the
  // 3D heading-up view even without an IMU stream (i.e. on any phone that
  // hasn't granted motion permission, or on desktop). We derive the
  // bearing from consecutive raw fixes when the device doesn't report a
  // GPS-derived heading directly.
  const lastFixTimestampRef = useRef<number | null>(null);
  const lastFixPosRef = useRef<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    if (!rawFix || rawFix.timestamp === lastFixTimestampRef.current) return;
    lastFixTimestampRef.current = rawFix.timestamp;

    const isNavigating = nav.destination != null;
    if (isNavigating) {
      // Prefer device-reported GPS heading (accurate above ~1 m/s). Fall
      // back to bearing between the previous fix and this one so the
      // camera still rotates while stationary/slow.
      let bearingRad: number | null =
        rawFix.headingDeg != null ? (rawFix.headingDeg * Math.PI) / 180 : null;
      if (bearingRad == null && lastFixPosRef.current) {
        bearingRad = bearingBetween(
          lastFixPosRef.current.lat,
          lastFixPosRef.current.lon,
          rawFix.lat,
          rawFix.lon,
        );
      }
      mapRef.current?.followVehicle(rawFix.lat, rawFix.lon, bearingRad ?? 0);
    } else {
      mapRef.current?.panTo(rawFix.lat, rawFix.lon);
    }
    lastFixPosRef.current = { lat: rawFix.lat, lon: rawFix.lon };
  }, [rawFix, nav.destination]);

  // The instant nav starts, kick the camera into 3D nav mode using the
  // best position we have — no need to wait for the next GPS tick.
  useEffect(() => {
    if (!nav.destination) return;
    const pos = currentPos;
    if (!pos) return;
    const bearingRad =
      rawFix?.headingDeg != null
        ? (rawFix.headingDeg * Math.PI) / 180
        : latestFused?.heading_rad ?? 0;
    mapRef.current?.followVehicle(pos.lat, pos.lon, bearingRad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.destination]);

  const uncertainty =
    latestFused && latestFused.std_e_m != null && latestFused.std_n_m != null
      ? Math.hypot(latestFused.std_e_m, latestFused.std_n_m)
      : rawFix?.accuracyM ?? null;

  const headingRad =
    latestFused?.heading_rad ??
    (rawFix?.headingDeg != null ? (rawFix.headingDeg * Math.PI) / 180 : null);

  // Speed: prefer geolocation's own speed (device sensor), fall back to
  // Kalman velocity magnitude if the browser doesn't report it.
  const speedKmh = (() => {
    if (rawFix?.speedMps != null && rawFix.speedMps >= 0) return rawFix.speedMps * 3.6;
    // If we ever expose vE/vN on the fused result we could fall back here.
    return null;
  })();

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-ink-950 text-ink-100">
      <MapView
        ref={mapRef}
        showLayers={["route", "corrected", "ellipse"]}
        initialStyle="satellite"
      />

      {/* Top nav */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3 sm:p-4">
        <LinkButton to="/" variant="secondary" size="sm" className="pointer-events-auto">
          <ChevronLeft size={14} /> Home
        </LinkButton>
        <div className="pointer-events-auto hidden rounded-md border border-ink-700 bg-ink-900/80 px-3 py-1.5 backdrop-blur sm:block">
          <Wordmark />
        </div>
        <div className="pointer-events-auto">
          <MapStyleToggle onChange={(s) => mapRef.current?.setStyle(s)} />
        </div>
      </header>

      {/* Only surfaces permission-denied errors. Transient GPS timeouts
          stay quiet. If you're not sharing location you can still route
          from wherever the map is pointing. */}
      {geoError && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <div className="pointer-events-auto rounded-md border border-status-alert/60 bg-status-alert/10 px-3 py-2 text-xs text-status-alert">
            {geoError}
          </div>
        </div>
      )}

      {/* Simulate-tunnel button — sits just above the recenter. Toggles
          gpsBlocked in the live sensor stream so the Kalman goes into
          pure dead-reckoning mode on demand. For pitch / vlog use. */}
      <button
        onClick={() => setGpsBlocked(!gpsBlocked)}
        className={
          "pointer-events-auto absolute bottom-56 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border shadow-raised backdrop-blur transition sm:bottom-60 " +
          (gpsBlocked
            ? "border-status-alert/60 bg-status-alert text-white hover:bg-status-alert/90"
            : "border-ink-700 bg-ink-900/85 text-ink-300 hover:bg-ink-800")
        }
        aria-label={gpsBlocked ? "Restore GPS" : "Simulate tunnel (block GPS)"}
        title={gpsBlocked ? "Restore GPS" : "Simulate tunnel"}
      >
        {gpsBlocked ? <SignalZero size={18} /> : <Signal size={18} />}
      </button>

      {gpsBlocked && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <div className="pointer-events-auto rounded-full border border-status-alert/60 bg-status-alert/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-status-alert backdrop-blur">
            Simulated tunnel · GPS blocked · IMU only
          </div>
        </div>
      )}

      {/* Recenter button — Google-Maps style. Always tappable. Shows a
          spinner while a fresh geolocation request is in flight, and a
          "no location" icon if permission has been denied. */}
      <button
        onClick={handleRecenter}
        className={
          "pointer-events-auto absolute bottom-40 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border shadow-raised backdrop-blur transition sm:bottom-44 " +
          (geoPermission === "denied"
            ? "border-status-alert/60 bg-status-alert/15 text-status-alert hover:bg-status-alert/25"
            : userMovedMap
              ? "border-accent-line bg-accent text-white hover:bg-accent-bright"
              : "border-ink-700 bg-ink-900/85 text-accent-bright hover:bg-ink-800")
        }
        aria-label={
          geoPermission === "denied"
            ? "Location permission denied"
            : "Center on my location"
        }
      >
        {geoLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : geoPermission === "denied" ? (
          <MapPinOff size={18} />
        ) : (
          <Crosshair size={18} />
        )}
      </button>

      {/* Search overlay */}
      {showSearch && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-3 sm:top-20">
          <div className="pointer-events-auto w-full max-w-md">
            <NavSearch
              near={currentPos}
              onClose={() => setShowSearch(false)}
              onSelect={(dest) => {
                setShowSearch(false);
                // Stage as pending — user confirms via the Directions
                // button in the preview panel. Also fly the camera to
                // frame both the current position and the destination
                // pin so they can see what they're picking.
                setPendingDest(dest);
                mapRef.current?.setDestinationMarker([dest.lon, dest.lat]);
                const origin = currentPos ?? mapRef.current?.getCenter() ?? null;
                if (origin) {
                  mapRef.current?.fitBounds(origin, { lat: dest.lat, lon: dest.lon });
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom cluster: nav panel OR preview OR search button + status strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-3 sm:items-start sm:p-4">
        {nav.destination && (
          <NavDirectionsPanel
            destinationName={nav.destination.name}
            currentStep={nav.currentStep}
            nextStep={nav.nextStep}
            remainingDistanceM={nav.remainingDistanceM}
            remainingDurationS={nav.remainingDurationS}
            arrived={nav.arrived}
            onCancel={nav.cancel}
          />
        )}

        {!nav.destination && pendingDest && (
          <DestinationPreview
            destination={pendingDest}
            origin={currentPos}
            loading={nav.loading}
            onCancel={() => {
              setPendingDest(null);
              mapRef.current?.setDestinationMarker(null);
              mapRef.current?.recenter();
            }}
            onDirections={() => {
              const origin = currentPos ?? mapRef.current?.getCenter() ?? null;
              const dest = pendingDest;
              setPendingDest(null);
              void nav.startNavigation(dest, origin);
            }}
          />
        )}

        {!nav.destination && !pendingDest && !showSearch && (
          <Button
            variant="primary"
            size="lg"
            className="pointer-events-auto w-full max-w-sm shadow-raised sm:w-auto"
            onClick={() => setShowSearch(true)}
            disabled={nav.loading}
          >
            <Search size={16} />
            {nav.loading ? "Planning route…" : "Where to?"}
          </Button>
        )}

        <Panel className="pointer-events-auto w-full max-w-md sm:w-auto">
          <div className="flex items-center gap-4 px-4 py-2 font-mono sm:gap-5">
            <StatCell label="Accuracy" value={uncertainty != null ? `±${uncertainty.toFixed(1)} m` : "—"} />
            <Divider />
            <StatCell
              label="Heading"
              value={
                headingRad != null
                  ? `${normalizeHeadingDeg(headingRad).toFixed(0).padStart(3, "0")}°`
                  : "—"
              }
            />
            <Divider />
            <StatCell
              label="Mode"
              value={motionMode ? modeLabel(motionMode) : "—"}
            />
            <Divider />
            <StatCell
              label="Speed"
              value={speedKmh != null ? `${speedKmh.toFixed(0)} km/h` : "—"}
            />
          </div>
        </Panel>

        {nav.error && (
          <div className="pointer-events-auto rounded-md border border-status-alert/60 bg-status-alert/10 px-3 py-2 text-xs text-status-alert">
            {nav.error}
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeHeadingDeg(rad: number): number {
  let deg = (rad * 180) / Math.PI;
  while (deg < 0) deg += 360;
  while (deg >= 360) deg -= 360;
  return deg;
}

function modeLabel(m: MotionMode): string {
  return { driving: "Driving", walking: "Walking", stationary: "Idle" }[m];
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-ink-500">{label}</span>
      <span className="tabular-nums text-sm font-semibold text-ink-100">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-3 w-px shrink-0 bg-ink-700" />;
}

/** Initial bearing from A to B, in radians in [0, 2π). */
function bearingBetween(latA: number, lonA: number, latB: number, lonB: number): number {
  const φ1 = (latA * Math.PI) / 180;
  const φ2 = (latB * Math.PI) / 180;
  const Δλ = ((lonB - lonA) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ + 2 * Math.PI) % (2 * Math.PI);
}
