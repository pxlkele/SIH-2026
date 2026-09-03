import { useEffect, useMemo, useRef, useState } from "react";
import { Car, ChevronLeft, Crosshair, Footprints, Pause, Search } from "lucide-react";
import MapView, { type MapViewHandle } from "../map/MapView";
import { MapStyleToggle } from "../map/MapStyleToggle";
import { useFusionStream } from "../data/useFusionStream";
import { useRawGeolocation } from "../data/useRawGeolocation";
import type { MotionMode } from "../motion/classifier";
import { useNavigation } from "../nav/useNavigation";
import { NavSearch } from "../nav/NavSearch";
import { NavDirectionsPanel } from "../nav/NavDirectionsPanel";
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
  const [motionConfidence, setMotionConfidence] = useState<number>(0);

  // Definitive current position — always driven by raw geolocation so it
  // works on desktop too.
  const { fix: rawFix, error: geoError } = useRawGeolocation();

  // Fused stream draws the corrected path + ellipse (mobile only in practice)
  const { latestFused } = useFusionStream({
    mode: "live",
    onFusedResult: (r) => mapRef.current?.pushFusedPoint(r),
    onMotionMode: (m, probs) => {
      setMotionMode(m);
      setMotionConfidence(probs[m]);
    },
  });

  // Recenter-button subscription
  useEffect(() => {
    const unsubscribe = mapRef.current?.onUserInteractionChange(setUserMovedMap);
    return () => unsubscribe?.();
  }, []);

  // Pan the map on every raw GPS fix (respecting user-interaction flag).
  // Fused samples override this via followVehicle when they arrive.
  useEffect(() => {
    if (rawFix) mapRef.current?.panTo(rawFix.lat, rawFix.lon);
  }, [rawFix]);

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

  useEffect(() => {
    mapRef.current?.setRoute(nav.route ? nav.route.geometry : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // wired properly below via a ref, this useEffect is only for cleanup

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

  const uncertainty =
    latestFused && latestFused.std_e_m != null && latestFused.std_n_m != null
      ? Math.hypot(latestFused.std_e_m, latestFused.std_n_m)
      : rawFix?.accuracyM ?? null;

  const headingRad =
    latestFused?.heading_rad ??
    (rawFix?.headingDeg != null ? (rawFix.headingDeg * Math.PI) / 180 : null);

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

      {/* Motion-mode pill — small badge below the top nav showing what the
          on-device classifier thinks the vehicle is doing right now. */}
      {motionMode && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <MotionModePill mode={motionMode} confidence={motionConfidence} />
        </div>
      )}

      {/* Only surfaces permission-denied errors. Transient GPS timeouts
          stay quiet. If you're not sharing location you can still route
          from wherever the map is pointing. */}
      {geoError && (
        <div className="pointer-events-none absolute inset-x-0 top-28 z-10 flex justify-center px-3">
          <div className="pointer-events-auto rounded-md border border-status-alert/60 bg-status-alert/10 px-3 py-2 text-xs text-status-alert">
            {geoError}
          </div>
        </div>
      )}

      {/* Recenter button — always visible. Shows a stronger accent when the
          user has manually panned away so it reads as "your action is
          waiting" rather than a passive control. */}
      <button
        onClick={() => {
          if (rawFix) mapRef.current?.panTo(rawFix.lat, rawFix.lon);
          mapRef.current?.recenter();
        }}
        className={
          "pointer-events-auto absolute bottom-40 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border shadow-raised backdrop-blur transition sm:bottom-44 " +
          (userMovedMap
            ? "border-accent-line bg-accent text-white hover:bg-accent-bright"
            : "border-ink-700 bg-ink-900/85 text-accent-bright hover:bg-ink-800")
        }
        aria-label="Center on my location"
      >
        <Crosshair size={18} />
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
                // If we don't have a GPS fix yet, route from wherever the
                // user is currently looking on the map. Beats silently
                // dropping the tap.
                const origin = currentPos ?? mapRef.current?.getCenter() ?? null;
                nav.startNavigation(dest, origin);
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom cluster: nav panel OR search button + status strip */}
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

        {!nav.destination && !showSearch && (
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

        <Panel className="pointer-events-auto w-full max-w-sm sm:w-auto">
          <div className="flex items-center gap-5 px-4 py-2 font-mono">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-ink-500">
                Accuracy
              </span>
              <span className="tabular-nums text-sm font-semibold text-ink-100">
                ±{uncertainty != null ? uncertainty.toFixed(1) : "—"} m
              </span>
            </div>
            <div className="h-3 w-px bg-ink-700" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-ink-500">
                Heading
              </span>
              <span className="tabular-nums text-sm font-semibold text-ink-100">
                {headingRad != null
                  ? `${normalizeHeadingDeg(headingRad).toFixed(0).padStart(3, "0")}°`
                  : "—"}
              </span>
            </div>
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

function MotionModePill({
  mode,
  confidence,
}: {
  mode: MotionMode;
  confidence: number;
}) {
  const cfg: Record<MotionMode, { icon: React.ReactNode; label: string }> = {
    driving:    { icon: <Car size={12} />,         label: "Driving" },
    walking:    { icon: <Footprints size={12} />,  label: "Walking" },
    stationary: { icon: <Pause size={12} />,       label: "Stationary" },
  };
  const c = cfg[mode];
  return (
    <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-ink-900/85 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-accent-bright backdrop-blur">
      {c.icon}
      <span>{c.label}</span>
      <span className="tabular-nums text-ink-500">{Math.round(confidence * 100)}%</span>
    </div>
  );
}
