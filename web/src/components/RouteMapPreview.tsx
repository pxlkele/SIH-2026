import { useEffect, useState } from "react";
import { encodePolyline } from "@/lib/polyline";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

interface Props {
  /** Public URL of a CSV with `lat,lon` columns. */
  csvUrl: string;
  /** Mapbox style to render underneath. */
  style?: "dark-v11" | "satellite-streets-v12" | "streets-v12";
  /** Overlay stroke colour (hex without #). */
  color?: string;
  /** Max points to include in the polyline — Mapbox Static URL is capped at
   *  ~8192 chars; ~60 points is a comfortable subsample. */
  maxPoints?: number;
  className?: string;
}

/**
 * Static Strava-style map preview of a drive. Fetches the trajectory CSV
 * once, subsamples, encodes as a polyline overlay, hits the Mapbox Static
 * Images API, renders the result as an <img>. Zero interaction cost.
 */
export function RouteMapPreview({
  csvUrl,
  style = "dark-v11",
  color = "3b82f6",
  maxPoints = 60,
  className = "",
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      setError("Mapbox token missing");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const text = await (await fetch(csvUrl)).text();
        const points = parseLatLon(text);
        if (points.length === 0) throw new Error("empty CSV");
        const sub = subsample(points, maxPoints);
        const encoded = encodePolyline(sub);
        // path-{width}+{color}-{opacity}({polyline})
        const overlay = `path-4+${color}-0.9(${encodeURIComponent(encoded)})`;
        // Retina 600x260 fits the card comfortably.
        const built =
          `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlay}` +
          `/auto/600x260@2x?padding=24&access_token=${MAPBOX_TOKEN}`;
        if (!cancelled) setUrl(built);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed");
      }
    })();
    return () => { cancelled = true; };
  }, [csvUrl, style, color, maxPoints]);

  if (error) {
    return (
      <div className={`flex h-40 items-center justify-center rounded-lg border border-ink-800 bg-ink-950/40 text-xs text-ink-500 ${className}`}>
        {error}
      </div>
    );
  }
  if (!url) {
    return <div className={`h-40 animate-pulse rounded-lg bg-ink-800/40 ${className}`} />;
  }
  return (
    <img
      src={url}
      alt="Route preview"
      className={`h-40 w-full rounded-lg border border-ink-800 object-cover ${className}`}
      loading="lazy"
    />
  );
}

function parseLatLon(csvText: string): Array<[number, number]> {
  const [header, ...rows] = csvText.trim().split(/\r?\n/);
  const cols = header.split(",");
  const iLat = cols.indexOf("lat");
  const iLon = cols.indexOf("lon");
  if (iLat < 0 || iLon < 0) return [];
  const out: Array<[number, number]> = [];
  for (const r of rows) {
    const p = r.split(",");
    const lat = parseFloat(p[iLat]);
    const lon = parseFloat(p[iLon]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push([lat, lon]);
  }
  return out;
}

/** Even-stride subsample. Keeps first and last points exactly. */
function subsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return out;
}
