import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, Radio } from "lucide-react";
import MapView, { type MapViewHandle } from "../map/MapView";
import { MapStyleToggle } from "../map/MapStyleToggle";
import { useFusionStream } from "../data/useFusionStream";
import { startSessionReplay } from "../data/sessionReplay";
import { listSessions, type SessionSummary } from "../data/sessionStore";
import type { FusedResult } from "../data/types";
import { Wordmark } from "../components/Logo";
import { LinkButton, Panel, Pill } from "../components/ui";

const SAMPLE_SOURCE = "__sample__";

/**
 * `/demo` — the pitch showcase. Split-screen (side-by-side on desktop,
 * stacked on mobile), synchronised cameras, GPS-lost centre pill, live
 * drift-counter HUD.
 *
 * Data source is switchable via the header dropdown: the built-in 3.2 km
 * sample drive, or any session recorded locally via /app.
 */
export default function DemoView() {
  const rawMapRef = useRef<MapViewHandle>(null);
  const fusedMapRef = useRef<MapViewHandle>(null);
  const [sourceId, setSourceId] = useState<string>(SAMPLE_SOURCE);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionState, setSessionState] = useState<{
    latestFused: FusedResult | null;
    isDRActive: boolean;
    gpsLostSeconds: number;
    driftMeters: number | null;
  }>({ latestFused: null, isDRActive: false, gpsLostSeconds: 0, driftMeters: null });

  // Load available recorded sessions once + refresh when we return here
  useEffect(() => {
    void listSessions().then(setSessions);
  }, []);

  // Sample-drive replay is handled by useFusionStream when sourceId is the
  // sample. Recorded-session replay is a manual side-effect below — same
  // wire shape, just a different source.
  const sampleActive = sourceId === SAMPLE_SOURCE;
  const { latestFused: sampleFused, isDRActive: sampleDR, gpsLostSeconds: sampleLost, driftMeters: sampleDrift } =
    useFusionStream({
      mode: sampleActive ? "replay" : "backend", // "backend" is inactive when VITE_BACKEND_URL isn't set
      onFusedResult: sampleActive
        ? (r) => {
            rawMapRef.current && r.gps_used && r.lat != null && r.lon != null
              ? rawMapRef.current.pushRawGpsPoint(r.lat, r.lon)
              : null;
            fusedMapRef.current?.pushFusedPoint(r);
          }
        : undefined,
    });

  // Session replay: when sourceId is a session, spin up a replay stream and
  // drive both maps ourselves. Clear the maps on switch so paths don't stack.
  useEffect(() => {
    if (sourceId === SAMPLE_SOURCE) return;
    rawMapRef.current?.clear();
    fusedMapRef.current?.clear();
    setSessionState({ latestFused: null, isDRActive: false, gpsLostSeconds: 0, driftMeters: null });

    let stopFn: (() => void) | null = null;
    let cancelled = false;
    void startSessionReplay({
      sessionId: sourceId,
      onFusedResult: (r) => {
        if (cancelled) return;
        rawMapRef.current?.pushRawGpsPoint(r.lat!, r.lon!);
        fusedMapRef.current?.pushFusedPoint(r);
        setSessionState((prev) => ({ ...prev, latestFused: r }));
      },
    }).then((handle) => {
      if (cancelled) {
        handle?.stop();
        return;
      }
      stopFn = handle?.stop ?? null;
    });

    return () => {
      cancelled = true;
      stopFn?.();
    };
  }, [sourceId]);

  const latestFused = sampleActive ? sampleFused : sessionState.latestFused;
  const isDRActive = sampleActive ? sampleDR : sessionState.isDRActive;
  const gpsLostSeconds = sampleActive ? sampleLost : sessionState.gpsLostSeconds;
  const driftMeters = sampleActive ? sampleDrift : sessionState.driftMeters;

  const uncertainty =
    latestFused && latestFused.std_e_m != null && latestFused.std_n_m != null
      ? Math.hypot(latestFused.std_e_m, latestFused.std_n_m)
      : null;

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-ink-950 text-ink-100">
      <DemoHeader
        sessions={sessions}
        sourceId={sourceId}
        onSourceChange={setSourceId}
        onStyleChange={(s) => {
          rawMapRef.current?.setStyle(s);
          fusedMapRef.current?.setStyle(s);
        }}
      />

      <div className="relative min-h-0 flex-1">
        <div className="grid h-full w-full grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1">
          <PanelWrap side="left">
            <MapView ref={rawMapRef} showLayers={["raw"]} syncWith={fusedMapRef} initialStyle="satellite" />
            <PanelLabel accent="raw" title="Raw GPS" subtitle="what Google Maps sees" />
          </PanelWrap>
          <PanelWrap side="right">
            <MapView
              ref={fusedMapRef}
              showLayers={["corrected", "matched", "ellipse"]}
              syncWith={rawMapRef}
              initialStyle="satellite"
            />
            <PanelLabel accent="live" title="Kalman-fused" subtitle="our system" />
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
  sessions,
  sourceId,
  onSourceChange,
  onStyleChange,
}: {
  sessions: SessionSummary[];
  sourceId: string;
  onSourceChange: (id: string) => void;
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
        <SessionPicker
          sessions={sessions}
          sourceId={sourceId}
          onChange={onSourceChange}
        />
        <MapStyleToggle onChange={onStyleChange} />
        <Pill tone="accent" dot>
          <Radio size={11} /> Live
        </Pill>
      </div>
    </header>
  );
}

function SessionPicker({
  sessions,
  sourceId,
  onChange,
}: {
  sessions: SessionSummary[];
  sourceId: string;
  onChange: (id: string) => void;
}) {
  const isSample = sourceId === SAMPLE_SOURCE;
  const active = isSample
    ? "Sample drive"
    : sessions.find((s) => s.id === sourceId)?.destinationName ??
      formatWhen(sessions.find((s) => s.id === sourceId)?.startedAt);
  return (
    <div className="relative inline-block">
      <select
        value={sourceId}
        onChange={(e) => onChange(e.target.value)}
        className="peer appearance-none rounded-md border border-ink-700 bg-ink-900/85 px-3 py-1.5 pr-8 text-xs font-medium text-ink-200 backdrop-blur transition hover:border-ink-500 focus:outline-none focus:ring-1 focus:ring-accent-bright"
        aria-label="Select replay source"
      >
        <option value={SAMPLE_SOURCE}>Sample drive · 3.2 km</option>
        {sessions.length > 0 && <option disabled>──────────</option>}
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {(s.destinationName ?? "Untitled") + " · " + formatWhen(s.startedAt) +
              " · " + (s.distanceM / 1000).toFixed(1) + " km"}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-400"
      />
      {/* Screen-reader-friendly current label — the styled version is the <select> itself */}
      <span className="sr-only">Currently viewing: {active}</span>
    </div>
  );
}

function formatWhen(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
