import { Navigation, X } from "lucide-react";
import { Button, Panel } from "../components/ui";
import { distanceM } from "./mapboxApi";

interface Props {
  destination: { name: string; lat: number; lon: number };
  origin: { lat: number; lon: number } | null;
  onDirections: () => void;
  onCancel: () => void;
  loading?: boolean;
}

/**
 * Google-Maps-style destination preview. Slides up when the user taps a
 * search result, before committing to full turn-by-turn navigation.
 * Shows straight-line distance as an instant estimate; the actual route
 * distance is computed on Directions tap.
 */
export function DestinationPreview({ destination, origin, onDirections, onCancel, loading }: Props) {
  const straightLineKm = origin
    ? distanceM(origin.lat, origin.lon, destination.lat, destination.lon) / 1000
    : null;

  return (
    <Panel className="pointer-events-auto w-full max-w-md">
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-accent-bright">
              Destination
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-ink-100">
              {destination.name}
            </div>
            <div className="mt-0.5 text-xs text-ink-400">
              {straightLineKm != null
                ? `~${straightLineKm.toFixed(1)} km away (as the crow flies)`
                : `${destination.lat.toFixed(4)}, ${destination.lon.toFixed(4)}`}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={onDirections}
          disabled={loading}
        >
          <Navigation size={16} />
          {loading ? "Planning route…" : "Directions"}
        </Button>
      </div>
    </Panel>
  );
}
