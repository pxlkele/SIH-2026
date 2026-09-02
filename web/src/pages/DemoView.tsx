import { Link } from "react-router-dom";
import { useRef } from "react";
import MapView, { type MapViewHandle } from "../map/MapView";
import { useFusionStream } from "../data/useFusionStream";

/**
 * `/demo` — the pitch showcase. Split-screen raw-GPS vs Kalman-fused,
 * synchronised camera, GPS-loss centre pill, drift counter HUD.
 * Design for a screenshot; each frame should read as a compelling story
 * even without motion.
 */
export default function DemoView() {
  const rawMapRef = useRef<MapViewHandle>(null);
  const fusedMapRef = useRef<MapViewHandle>(null);

  const { latestFused, isDRActive, gpsLostSeconds, driftMeters } = useFusionStream({
    onFusedResult: (r) => {
      fusedMapRef.current?.pushFusedPoint(r);
      if (r.gps_used && r.lat != null && r.lon != null) {
        rawMapRef.current?.pushRawGpsPoint(r.lat, r.lon);
      }
    },
  });

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="grid h-full w-full grid-cols-2">
        <div className="relative border-r border-neutral-800">
          <MapView ref={rawMapRef} showLayers={["raw"]} syncWith={fusedMapRef} />
          <PanelLabel>Raw GPS · what Google Maps sees</PanelLabel>
        </div>
        <div className="relative">
          <MapView ref={fusedMapRef} showLayers={["corrected", "matched", "ellipse"]} syncWith={rawMapRef} />
          <PanelLabel>Kalman-fused · our system</PanelLabel>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <Link
          to="/"
          className="pointer-events-auto rounded-md bg-black/70 px-3 py-1.5 text-xs font-medium text-neutral-200 backdrop-blur hover:bg-black/90"
        >
          ← Home
        </Link>
        <div className="pointer-events-auto rounded-md bg-black/70 px-3 py-1.5 font-mono text-xs text-neutral-300 backdrop-blur">
          SIH26168 · Dead Reckoning
        </div>
      </div>

      {isDRActive && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <div className="rounded-full bg-red-500/95 px-6 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-2xl">
            GPS LOST — dead reckoning active · {formatDuration(gpsLostSeconds)}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 right-4 z-10">
        <DriftHUD
          uncertaintyM={latestFused ? Math.hypot(latestFused.std_e_m ?? 0, latestFused.std_n_m ?? 0) : null}
          gpsLostSeconds={gpsLostSeconds}
          driftMeters={driftMeters}
        />
      </div>
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-black/70 px-3 py-1.5 text-xs font-medium text-neutral-200 backdrop-blur">
      {children}
    </div>
  );
}

function DriftHUD({
  uncertaintyM,
  gpsLostSeconds,
  driftMeters,
}: {
  uncertaintyM: number | null;
  gpsLostSeconds: number;
  driftMeters: number | null;
}) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-black/80 p-4 font-mono text-neutral-200 backdrop-blur">
      <HUDRow label="Uncertainty" value={uncertaintyM != null ? `${uncertaintyM.toFixed(1)} m` : "—"} />
      <HUDRow label="GPS lost for" value={formatDuration(gpsLostSeconds)} />
      <HUDRow label="Deviation from raw" value={driftMeters != null ? `${driftMeters.toFixed(1)} m` : "—"} />
    </div>
  );
}

function HUDRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-0.5">
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="tabular-nums text-sm">{value}</div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
