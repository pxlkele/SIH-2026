/**
 * Pre-cache Mapbox tiles + Directions responses for a specific bounding box
 * so the app renders that area offline (airplane mode). Sits on top of the
 * service worker's runtime cache — the SW's NetworkFirst/CacheFirst rules
 * handle actual storage; this module just makes sure the right requests
 * happen while we have connectivity.
 */

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export interface PrecacheOptions {
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
  /** Zoom levels to fetch. 14-17 is a good range for street-level driving. */
  zooms?: number[];
  onProgress?: (done: number, total: number) => void;
}

export interface PrecacheResult {
  fetched: number;
  failed: number;
  cachedMB: number;
}

/**
 * Warm the service worker cache with every Mapbox tile inside `bbox` at each
 * of the requested zoom levels — for both dark and satellite styles (so the
 * style toggle keeps working offline).
 */
export async function precacheTiles({
  bbox,
  zooms = [14, 15, 16, 17],
  onProgress,
}: PrecacheOptions): Promise<PrecacheResult> {
  if (!TOKEN) throw new Error("VITE_MAPBOX_TOKEN not set");

  const styles = ["dark-v11", "satellite-streets-v12"];
  const urls: string[] = [];

  for (const style of styles) {
    for (const z of zooms) {
      const [xMin, yMin, xMax, yMax] = tileRangeForBbox(bbox, z);
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          urls.push(
            `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/${z}/${x}/${y}@2x?access_token=${TOKEN}`,
          );
        }
      }
    }
  }

  let done = 0;
  let failed = 0;
  let bytes = 0;
  const CONCURRENCY = 8;

  const runOne = async (url: string) => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      bytes += blob.size;
    } catch {
      failed++;
    } finally {
      done++;
      onProgress?.(done, urls.length);
    }
  };

  // Simple concurrency-limited runner
  const queue = [...urls];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const u = queue.shift();
          if (u) await runOne(u);
        }
      })(),
    );
  }
  await Promise.all(workers);

  return { fetched: done - failed, failed, cachedMB: +(bytes / (1024 * 1024)).toFixed(1) };
}

/** WGS84 lon/lat → tile x/y at given zoom (standard XYZ scheme). */
function tileRangeForBbox(
  [minLon, minLat, maxLon, maxLat]: [number, number, number, number],
  z: number,
): [number, number, number, number] {
  const [xMin, yMax] = lonLatToTile(minLon, minLat, z);
  const [xMax, yMin] = lonLatToTile(maxLon, maxLat, z);
  return [xMin, yMin, xMax, yMax];
}

function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return [x, y];
}

/** Bounding box that covers the full 09-02a real drive plus a 500m buffer. */
export const DEMO_ROUTE_BBOX: [number, number, number, number] = [77.585, 13.120, 77.595, 13.140];
