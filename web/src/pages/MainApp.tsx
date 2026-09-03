import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Navigation, Search } from "lucide-react";
import MapView, { type MapViewHandle } from "../map/MapView";
import { MapStyleToggle } from "../map/MapStyleToggle";
import { useFusionStream, type SourceMode } from "../data/useFusionStream";
import { SourcePicker } from "../data/SourcePicker";
import { OfflineCacheButton } from "../data/OfflineCacheButton";
import type { LiveStreamStatus } from "../data/liveSensorStream";
import { useNavigation } from "../nav/useNavigation";
import { NavSearch } from "../nav/NavSearch";
import { NavDirectionsPanel } from "../nav/NavDirectionsPanel";
import { Wordmark } from "../components/Logo";
import { Button, LinkButton, Panel, Pill } from "../components/ui";

const BACKEND_CONFIGURED = Boolean(import.meta.env.VITE_BACKEND_URL);

/**
 * `/app` — the product view. Single fused path + follow-vehicle camera +
 * uncertainty ellipse + turn-by-turn navigation. This is the "here's what
 * a user actually sees" surface.
 *
 * The pitch line: our navigation doesn't break when GPS does. Enter a
 * destination, get a route, drive into a tunnel — everyone else's blue
 * dot freezes; ours keeps advancing along the route because the IMU takes
 * over. Same UX as Google Maps, plus the thing Google Maps can't do.
 */
export default function MainApp() {
  const mapRef = useRef<MapViewHandle>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("live");
  const [liveStatus, setLiveStatus] = useState<LiveStreamStatus>({ kind: "idle" });

  const { latestFused, isDRActive } = useFusionStream({
    mode: sourceMode,
    onFusedResult: (r) => mapRef.current?.pushFusedPoint(r),
    onLiveStatus: setLiveStatus,
  });

  const currentPos = useMemo(
    () =>
      latestFused && latestFused.lat != null && latestFused.lon != null
        ? { lat: latestFused.lat, lon: latestFused.lon }
        : null,
    [latestFused],
  );

  const nav = useNavigation({ currentPos });

  // Follow the vehicle
  useEffect(() => {
    if (currentPos && latestFused) {
      mapRef.current?.followVehicle(
        currentPos.lat,
        currentPos.lon,
        latestFused.heading_rad ?? 0,
      );
    }
  }, [currentPos, latestFused]);

  // Push the route geometry + destination pin to the map when they change
  useEffect(() => {
    if (nav.route) {
      mapRef.current?.setRoute(nav.route.geometry);
    } else {
      mapRef.current?.setRoute(null);
    }
  }, [nav.route]);

  useEffect(() => {
    if (nav.destination) {
      mapRef.current?.setDestinationMarker([nav.destination.lon, nav.destination.lat]);
    } else {
      mapRef.current?.setDestinationMarker(null);
    }
  }, [nav.destination]);

  const uncertainty =
    latestFused && latestFused.std_e_m != null && latestFused.std_n_m != null
      ? Math.hypot(latestFused.std_e_m, latestFused.std_n_m)
      : null;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-ink-950 text-ink-100">
      <MapView ref={mapRef} showLayers={["route", "corrected", "ellipse"]} initialStyle="satellite" />

      {/* Top nav */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3 sm:p-4">
        <LinkButton to="/" variant="secondary" size="sm" className="pointer-events-auto">
          <ChevronLeft size={14} /> Home
        </LinkButton>
        <div className="pointer-events-auto hidden rounded-md border border-ink-700 bg-ink-900/80 px-3 py-1.5 backdrop-blur sm:block">
          <Wordmark />
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <SourcePicker
            mode={sourceMode}
            onChange={(m) => {
              mapRef.current?.clear();
              setSourceMode(m);
            }}
            backendConfigured={BACKEND_CONFIGURED}
          />
          <MapStyleToggle onChange={(s) => mapRef.current?.setStyle(s)} />
          {isDRActive ? (
            <Pill tone="warn" dot>
              <Navigation size={11} />
              Dead reckoning
            </Pill>
          ) : (
            <Pill tone="ok" dot>
              GPS lock
            </Pill>
          )}
        </div>
      </header>

      {sourceMode === "live" && liveStatus.kind === "error" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <div className="pointer-events-auto rounded-md border border-status-alert/60 bg-status-alert/10 px-3 py-2 text-xs text-status-alert">
            {liveStatus.message}
          </div>
        </div>
      )}
      {sourceMode === "live" && liveStatus.kind === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <Pill tone="ok" dot className="pointer-events-auto">
            Live · {liveStatus.imuHz} Hz IMU · {liveStatus.gpsFixes} GPS fixes
          </Pill>
        </div>
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

        <div className="pointer-events-auto self-center sm:self-start">
          <OfflineCacheButton />
        </div>
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
