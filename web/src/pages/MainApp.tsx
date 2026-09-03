import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Crosshair, Search } from "lucide-react";
import MapView, { type MapViewHandle } from "../map/MapView";
import { MapStyleToggle } from "../map/MapStyleToggle";
import { useFusionStream } from "../data/useFusionStream";
import type { LiveStreamStatus } from "../data/liveSensorStream";
import { useNavigation } from "../nav/useNavigation";
import { NavSearch } from "../nav/NavSearch";
import { NavDirectionsPanel } from "../nav/NavDirectionsPanel";
import { Wordmark } from "../components/Logo";
import { Button, LinkButton, Panel } from "../components/ui";

/**
 * `/app` — the product view. Single fused path + follow-vehicle camera +
 * uncertainty ellipse + turn-by-turn navigation.
 *
 * Always runs on live on-device sensors (no source picker, no cloud/replay
 * options exposed here). Replay is reserved for the home landing.
 */
export default function MainApp() {
  const mapRef = useRef<MapViewHandle>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStreamStatus>({ kind: "idle" });
  const [userMovedMap, setUserMovedMap] = useState(false);

  const { latestFused } = useFusionStream({
    mode: "live",
    onFusedResult: (r) => mapRef.current?.pushFusedPoint(r),
    onLiveStatus: setLiveStatus,
  });

  // Subscribe to the map's user-interaction flag so we can show a Recenter
  // button when the user has manually panned or rotated.
  useEffect(() => {
    const unsubscribe = mapRef.current?.onUserInteractionChange(setUserMovedMap);
    return () => unsubscribe?.();
  }, []);

  const currentPos = useMemo(
    () =>
      latestFused && latestFused.lat != null && latestFused.lon != null
        ? { lat: latestFused.lat, lon: latestFused.lon }
        : null,
    [latestFused],
  );

  const nav = useNavigation({ currentPos });

  useEffect(() => {
    if (currentPos && latestFused) {
      mapRef.current?.followVehicle(
        currentPos.lat,
        currentPos.lon,
        latestFused.heading_rad ?? 0,
      );
    }
  }, [currentPos, latestFused]);

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
      : null;

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

      {/* Only surfaces genuine hard errors (permission denied). Transient
          GPS timeouts/unavailable errors stay quiet — the ellipse growing
          already communicates uncertainty visually. */}
      {liveStatus.kind === "error" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <div className="pointer-events-auto rounded-md border border-status-alert/60 bg-status-alert/10 px-3 py-2 text-xs text-status-alert">
            {liveStatus.message}
          </div>
        </div>
      )}

      {/* Recenter button — floats bottom-right above the search bar when the
          user has manually panned/rotated. Tap to snap back to auto-follow. */}
      {userMovedMap && (
        <button
          onClick={() => mapRef.current?.recenter()}
          className="pointer-events-auto absolute bottom-40 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-ink-700 bg-ink-900/85 text-accent-bright shadow-raised backdrop-blur transition hover:bg-ink-800 sm:bottom-44"
          aria-label="Recenter on vehicle"
        >
          <Crosshair size={18} />
        </button>
      )}

      {/* Search overlay */}
      {showSearch && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-3 sm:top-20">
          <div className="pointer-events-auto w-full max-w-md">
            <NavSearch
              near={currentPos}
              onClose={() => setShowSearch(false)}
              onSelect={(dest) => {
                setShowSearch(false);
                nav.startNavigation(dest);
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
                {latestFused?.heading_rad != null
                  ? `${normalizeHeadingDeg(latestFused.heading_rad).toFixed(0).padStart(3, "0")}°`
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

