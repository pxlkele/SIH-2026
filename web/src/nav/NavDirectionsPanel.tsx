import { ArrowUp, CornerUpLeft, CornerUpRight, MapPin, X } from "lucide-react";
import type { RouteStep } from "./mapboxApi";
import { Panel } from "../components/ui";

interface Props {
  destinationName: string;
  currentStep: RouteStep | null;
  nextStep: RouteStep | null;
  remainingDistanceM: number;
  remainingDurationS: number;
  arrived: boolean;
  onCancel: () => void;
}

/**
 * Turn-by-turn instructions overlay. Shows the current maneuver prominently,
 * the next one below, and the ETA/remaining distance to destination.
 */
export function NavDirectionsPanel({
  destinationName,
  currentStep,
  nextStep,
  remainingDistanceM,
  remainingDurationS,
  arrived,
  onCancel,
}: Props) {
  if (arrived) {
    return (
      <Panel className="pointer-events-auto w-full max-w-sm p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-status-ok/20 text-status-ok">
            <MapPin size={18} />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-status-ok">Arrived</div>
            <div className="text-sm font-semibold text-ink-100">{destinationName}</div>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            aria-label="End navigation"
          >
            <X size={14} />
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="pointer-events-auto w-full max-w-sm">
      {/* Current maneuver */}
      <div className="flex items-center gap-3 p-4">
        <ManeuverIcon type={currentStep?.maneuverType} />
        <div className="flex-1 leading-tight">
          <div className="text-sm font-semibold text-ink-100">
            {currentStep?.instruction ?? "Continue on route"}
          </div>
          {currentStep && (
            <div className="mt-0.5 text-xs text-ink-400">
              in {formatMeters(currentStep.distanceM)}
            </div>
          )}
        </div>
        <button
          onClick={onCancel}
          className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          aria-label="Cancel navigation"
        >
          <X size={14} />
        </button>
      </div>

      {/* Next step */}
      {nextStep && (
        <div className="flex items-center gap-3 border-t border-ink-800 px-4 py-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-800 text-ink-400">
            <ManeuverIcon type={nextStep.maneuverType} size={12} />
          </div>
          <div className="text-xs text-ink-400 truncate">
            <span className="text-ink-300">Then:</span> {nextStep.instruction}
          </div>
        </div>
      )}

      {/* Destination + ETA */}
      <div className="flex items-center justify-between gap-3 border-t border-ink-800 bg-ink-950/40 px-4 py-2.5 font-mono">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <MapPin size={12} className="text-ink-500 shrink-0" />
          <span className="truncate text-xs text-ink-300">{destinationName}</span>
        </div>
        <div className="flex items-baseline gap-3 text-xs">
          <span className="tabular-nums text-ink-100">
            {formatMeters(remainingDistanceM)}
          </span>
          <span className="text-ink-500">·</span>
          <span className="tabular-nums text-ink-100">
            {formatDuration(remainingDurationS)}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function ManeuverIcon({ type, size = 20 }: { type?: string; size?: number }) {
  const cls = "text-accent-bright";
  if (!type) return <ArrowUp size={size} className={cls} />;
  if (type.includes("left")) return <CornerUpLeft size={size} className={cls} />;
  if (type.includes("right")) return <CornerUpRight size={size} className={cls} />;
  if (type === "arrive") return <MapPin size={size} className={cls} />;
  return <ArrowUp size={size} className={cls} />;
}

function formatMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
