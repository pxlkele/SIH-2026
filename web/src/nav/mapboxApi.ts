/**
 * Thin wrappers over Mapbox's Geocoding + Directions APIs. Both are in the
 * free tier at our demo scale. Uses VITE_MAPBOX_TOKEN.
 */

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export interface GeocodeMatch {
  name: string;
  address: string;
  lat: number;
  lon: number;
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS: number;
  maneuverType: string;
  location: [number, number];    // [lon, lat] where the maneuver happens
}

export interface Route {
  geometry: [number, number][];  // list of [lon, lat] along the whole route
  steps: RouteStep[];
  totalDistanceM: number;
  totalDurationS: number;
}

export async function geocode(query: string, near?: [number, number]): Promise<GeocodeMatch[]> {
  const results = await geocodeMapbox(query, near);
  // Mapbox's India POI coverage has real gaps — e.g. universities like
  // "Manipal Academy of Higher Education" are missing. When it returns
  // nothing (or one obviously-wrong fallback match), we hit OpenStreetMap
  // Nominatim as a backstop. Nominatim ToS caps us at 1 req/sec, but our
  // 250 ms input debounce already keeps us well inside that.
  if (results.length === 0) {
    return geocodeNominatim(query, near);
  }
  return results;
}

async function geocodeMapbox(query: string, near?: [number, number]): Promise<GeocodeMatch[]> {
  if (!TOKEN) throw new Error("VITE_MAPBOX_TOKEN not set");
  const params = new URLSearchParams({
    access_token: TOKEN,
    limit: "5",
    country: "in",
  });
  if (near) params.set("proximity", `${near[0]},${near[1]}`);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`geocode failed: ${resp.status}`);
  const data = await resp.json();
  return (data.features as any[]).map((f) => ({
    name: f.text as string,
    address: (f.place_name as string) ?? "",
    lon: f.center[0] as number,
    lat: f.center[1] as number,
  }));
}

async function geocodeNominatim(query: string, near?: [number, number]): Promise<GeocodeMatch[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    countrycodes: "in",
    limit: "5",
    addressdetails: "1",
  });
  if (near) {
    // Nominatim viewbox is [minLon, minLat, maxLon, maxLat]. Give ~40 km
    // radius around `near` so proximity-biased ranking still works.
    const [lon, lat] = near;
    const d = 0.4;
    params.set("viewbox", `${lon - d},${lat + d},${lon + d},${lat - d}`);
    params.set("bounded", "0");   // still allow results outside, just prefer inside
  }
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data as any[]).map((r) => {
      // Prefer the compact "name" (e.g. "Manipal Academy of Higher Education")
      // if Nominatim gives us one, else pull the first non-address component
      // from display_name.
      const name = r.name || (r.display_name as string).split(",")[0].trim();
      return {
        name,
        address: r.display_name as string,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      };
    });
  } catch {
    return [];
  }
}

export async function getRoute(
  from: [number, number],
  to: [number, number],
): Promise<Route> {
  if (!TOKEN) throw new Error("VITE_MAPBOX_TOKEN not set");
  const params = new URLSearchParams({
    access_token: TOKEN,
    geometries: "geojson",
    overview: "full",
    steps: "true",
    banner_instructions: "false",
    voice_instructions: "false",
  });
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`route failed: ${resp.status}`);
  const data = await resp.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("no route found");

  const geometry: [number, number][] = route.geometry.coordinates;
  const steps: RouteStep[] = (route.legs?.[0]?.steps ?? []).map((s: any) => ({
    instruction: s.maneuver?.instruction ?? "Continue",
    distanceM: s.distance ?? 0,
    durationS: s.duration ?? 0,
    maneuverType: s.maneuver?.type ?? "continue",
    location: s.maneuver?.location ?? geometry[0],
  }));

  return {
    geometry,
    steps,
    totalDistanceM: route.distance ?? 0,
    totalDurationS: route.duration ?? 0,
  };
}

/**
 * Load a precomputed route for one of the preset destinations. Used as a
 * fallback when the live Directions API is unreachable (airplane mode,
 * flaky connectivity). Origin is fixed to a canonical Bengaluru point —
 * the demo lives in that area anyway.
 */
export async function loadPresetRoute(destSlug: string): Promise<Route | null> {
  try {
    const resp = await fetch("/preset_routes.json");
    if (!resp.ok) return null;
    const data = await resp.json();
    const r = data.routes?.[destSlug];
    if (!r) return null;
    return {
      geometry: r.geometry as [number, number][],
      steps: (r.steps ?? []).map((s: any) => ({
        instruction: s.instruction ?? "Continue",
        distanceM: s.distance ?? 0,
        durationS: s.duration ?? 0,
        maneuverType: s.maneuverType ?? "continue",
        location: s.location,
      })),
      totalDistanceM: r.distance ?? 0,
      totalDurationS: r.duration ?? 0,
    };
  } catch (e) {
    console.warn("[preset-route] fallback load failed", e);
    return null;
  }
}

/** Distance in metres between two lat/lon pairs (haversine). */
export function distanceM(latA: number, lonA: number, latB: number, lonB: number): number {
  const R = 6_378_137;
  const dLat = ((latB - latA) * Math.PI) / 180;
  const dLon = ((lonB - lonA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latA * Math.PI) / 180) *
      Math.cos((latB * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
