import { useRef } from "react";
import { AlertTriangle, ChevronLeft, Radio } from "lucide-react";
import MapView, { type MapViewHandle } from "../map/MapView";
import { MapStyleToggle } from "../map/MapStyleToggle";
import { useFusionStream } from "../data/useFusionStream";
import { Wordmark } from "../components/Logo";
import { LinkButton, Panel, Pill } from "../components/ui";

/**
 * `/demo` — the pitch showcase. Split-screen (side-by-side on desktop,
 * stacked on mobile), synchronised cameras, GPS-lost centre pill, live
 * drift-counter HUD.
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

  const uncertainty =
    latestFused && latestFused.std_e_m != null && latestFused.std_n_m != null
      ? Math.hypot(latestFused.std_e_m, latestFused.std_n_m)
      : null;

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-ink-950 text-ink-100">
      <DemoHeader
        onStyleChange={(s) => {
          rawMapRef.current?.setStyle(s);
          fusedMapRef.current?.setStyle(s);
        }}
      />

      <div className="relative min-h-0 flex-1">
        <div className="grid h-full w-full grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1">
          <PanelWrap side="left">
            <MapView ref={rawMapRef} showLayers={["raw"]} syncWith={fusedMapRef} />
            <PanelLabel
              accent="raw"
              title="Raw GPS"
              subtitle="what Google Maps sees"
            />
          </PanelWrap>
          <PanelWrap side="right">
            <MapView
              ref={fusedMapRef}
              showLayers={["corrected", "matched", "ellipse"]}
              syncWith={rawMapRef}
            />
            <PanelLabel
              accent="live"
              title="Kalman-fused"
              subtitle="our system"
            />
          </PanelWrap>
        </div>

        {isDRActive && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center px-4">
            <div className="flex items-center gap-2.5 rounded-full border border-status-alert/60 bg-status-alert/90 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white shadow-2xl backdrop-blur sm:text-sm">
              <AlertTriangle size={16} />
              GPS lost · dead reckoning · {formatDuration(gpsLostSeconds)}
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-end p-3 sm:p-5">
          <DriftHUD
            uncertaintyM={uncertainty}
            gpsLostSeconds={gpsLostSeconds}
            driftMeters={driftMeters}
          />
        </div>
      </div>
    </div>
  );
}

function DemoHeader({
  onStyleChange,
}: {
  onStyleChange: (s: import("../map/MapView").MapStyle) => void;
}) {
  return (
    <header className="z-30 flex h-12 items-center justify-between border-b border-ink-800/80 bg-ink-950/85 px-3 backdrop-blur sm:h-14 sm:px-5">
      <div className="flex items-center gap-3">
        <LinkButton to="/app" variant="ghost" size="sm">
          <ChevronLeft size={14} /> <span className="hidden sm:inline">App</span>
        </LinkButton>
        <div className="hidden h-4 w-px bg-ink-700 sm:block" />
        <div className="hidden sm:block">
          <Wordmark subtitle="Split view" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <MapStyleToggle onChange={onStyleChange} />
        <Pill tone="accent" dot>
          <Radio size={11} /> Live
        </Pill>
      </div>
    </header>
  );
}

function PanelWrap({
  children,
  side,
}: {
  children: React.ReactNode;
  side: "left" | "right";
}) {
  return (
    <div
      className={
        "relative min-h-0 " +
        (side === "left"
          ? "border-b border-ink-800/80 md:border-b-0 md:border-r"
          : "")
      }
    >
      {children}
    </div>
  );
}

function PanelLabel({
  accent,
  title,
  subtitle,
}: {
  accent: "raw" | "live";
  title: string;
  subtitle: string;
}) {
  const dotClass = accent === "raw" ? "bg-path-raw" : "bg-path-live";
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
      <div className="flex items-center gap-2.5 rounded-md border border-ink-700 bg-ink-900/75 px-3 py-1.5 backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <div className="flex items-baseline gap-2 leading-none">
          <span className="text-xs font-semibold text-ink-100">{title}</span>
          <span className="hidden text-[10px] uppercase tracking-wider text-ink-400 sm:inline">
            {subtitle}
          </span>
        </div>
      </div>
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
    <Panel className="pointer-events-auto w-full max-w-xs sm:w-auto">
      <div className="grid grid-cols-3 gap-4 p-3 font-mono sm:gap-6 sm:p-4">
        <Metric
          label="Uncertainty"
          value={uncertaintyM != null ? uncertaintyM.toFixed(1) : "—"}
          unit={uncertaintyM != null ? "m" : ""}
          tone={
            uncertaintyM == null
              ? "neutral"
              : uncertaintyM > 20
                ? "alert"
                : uncertaintyM > 10
                  ? "warn"
                  : "ok"
          }
        />
        <Metric
          label="GPS lost"
          value={formatDuration(gpsLostSeconds)}
          unit=""
          tone={gpsLostSeconds > 2 ? "alert" : "neutral"}
        />
        <Metric
          label="Δ from raw"
          value={driftMeters != null ? driftMeters.toFixed(1) : "—"}
          unit={driftMeters != null ? "m" : ""}
          tone="neutral"
        />
      </div>
    </Panel>
  );
}

function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "ok" | "warn" | "alert" | "neutral";
}) {
  const valueColor =
    tone === "ok"
      ? "text-status-ok"
      : tone === "warn"
        ? "text-status-warn"
        : tone === "alert"
          ? "text-status-alert"
          : "text-ink-100";
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-lg font-semibold tabular-nums sm:text-xl ${valueColor}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-ink-400">{unit}</span>}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
