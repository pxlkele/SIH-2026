import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { geocode, type GeocodeMatch } from "./mapboxApi";

interface Props {
  near?: { lat: number; lon: number } | null;
  onSelect: (dest: { name: string; lat: number; lon: number }) => void;
  onClose?: () => void;
}

// Preset destinations near the demo drive area (North Bengaluru).
// One-tap shortcuts so the demo doesn't require typing.
const PRESETS: { label: string; lat: number; lon: number; name: string }[] = [
  { label: "MG Road", name: "MG Road, Bengaluru",       lat: 12.9760, lon: 77.6060 },
  { label: "Hebbal", name: "Hebbal, Bengaluru",         lat: 13.0355, lon: 77.5970 },
  { label: "Cubbon Park", name: "Cubbon Park, Bengaluru", lat: 12.9764, lon: 77.5929 },
  { label: "Jayanagar", name: "Jayanagar, Bengaluru",   lat: 12.9250, lon: 77.5936 },
];

/**
 * Search box for a destination. Geocodes via Mapbox with proximity bias
 * towards the current vehicle position so nearby results rank first.
 */
export function NavSearch({ near, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced geocode
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const id = setTimeout(() => {
      setLoading(true);
      setError(null);
      geocode(query, near ? [near.lon, near.lat] : undefined)
        .then((r) => setResults(r))
        .catch((e) => {
          console.error("[geocode] failed:", e);
          setError(e instanceof Error ? e.message : "Search failed");
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(id);
  }, [query, near]);

  return (
    <div className="w-full max-w-md rounded-lg border border-ink-700 bg-ink-900/95 shadow-raised backdrop-blur">
      <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2">
        <Search size={16} className="text-ink-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Where to?"
          className="w-full bg-transparent text-sm text-ink-100 placeholder-ink-500 focus:outline-none"
        />
        {loading && (
          <span className="text-[10px] uppercase tracking-wider text-ink-400">Searching…</span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            aria-label="Close search"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {results.length > 0 && (
        <ul className="max-h-72 overflow-y-auto py-1">
          {results.map((r, i) => (
            <li key={i}>
              <button
                onClick={() => onSelect({ name: r.name, lat: r.lat, lon: r.lon })}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-ink-800/60"
              >
                <span className="text-sm text-ink-100">{r.name}</span>
                <span className="text-xs text-ink-400">{r.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="border-t border-status-alert/30 bg-status-alert/10 px-3 py-2 text-xs text-status-alert">
          {error}
        </div>
      )}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <div className="px-3 py-3 text-xs text-ink-500">No results</div>
      )}

      {/* Preset destinations — one-tap for the demo */}
      {query.trim().length < 2 && (
        <div className="border-t border-ink-800 px-3 py-2.5">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-500">
            Quick destinations
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => onSelect({ name: p.name, lat: p.lat, lon: p.lon })}
                className="rounded-full border border-ink-700 bg-ink-800/60 px-2.5 py-1 text-xs text-ink-200 transition hover:border-accent-line hover:bg-accent-soft hover:text-accent-bright"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
