import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { geocode, type GeocodeMatch } from "./mapboxApi";

interface Props {
  near?: { lat: number; lon: number } | null;
  onSelect: (dest: { name: string; lat: number; lon: number }) => void;
  onClose?: () => void;
}

/**
 * Search box for a destination. Geocodes via Mapbox with proximity bias
 * towards the current vehicle position so nearby results rank first.
 */
export function NavSearch({ near, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced geocode
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      setLoading(true);
      geocode(query, near ? [near.lon, near.lat] : undefined)
        .then((r) => setResults(r))
        .catch(() => setResults([]))
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
      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <div className="px-3 py-3 text-xs text-ink-500">No results</div>
      )}
    </div>
  );
}
