import { forwardRef, useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import mapboxgl from "mapbox-gl";
import type { FusedResult } from "../data/types";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

/** Layers we know how to render. */
export type LayerId = "corrected" | "smoothed" | "matched" | "raw" | "ellipse" | "route";

export interface MapViewHandle {
  pushFusedPoint(r: FusedResult): void;
  pushRawGpsPoint(lat: number, lon: number): void;
  followVehicle(lat: number, lon: number, headingRad: number): void;
  /** Pan (and jump the marker) to a raw lat/lon without heading rotation.
   *  Used when raw geolocation gives us a fix independently of the fused
   *  stream — no heading, so we can't align the map bearing. */
  panTo(lat: number, lon: number): void;
  /** Fit both points into the current viewport, with a friendly zoom/pitch
   *  reset so the user can preview "this is where you're going". */
  fitBounds(a: { lat: number; lon: number }, b: { lat: number; lon: number }): void;
  /** Return the current map center — used as a fallback origin for routing
   *  when neither raw nor fused GPS has produced a fix yet. */
  getCenter(): { lat: number; lon: number } | null;
  setMatchedPath(points: { lat: number; lon: number }[]): void;
  setSmoothedPath(points: { lat: number; lon: number }[]): void;
  setRoute(geometry: [number, number][] | null): void;
  setDestinationMarker(coord: [number, number] | null): void;
  setStyle(style: MapStyle): void;
  /** Return to auto-follow AND immediately snap to the last known vehicle
   *  position, so the button is responsive even if no new sample has come in. */
  recenter(): void;
  /** true if the user manually panned/rotated and we're not auto-following. */
  onUserInteractionChange(cb: (userIsInteracting: boolean) => void): () => void;
  clear(): void;
}

export type MapStyle = "dark" | "streets" | "satellite";

const STYLE_URL: Record<MapStyle, string> = {
  dark:      "mapbox://styles/mapbox/dark-v11",
  streets:   "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

interface Props {
  showLayers: LayerId[];
  /** Initial style — defaults to "dark". */
  initialStyle?: MapStyle;
  /** Optional: keep another MapView's camera in sync with this one. */
  syncWith?: RefObject<MapViewHandle | null>;
}

// North Bengaluru near MAHE / where the real 09-02 drive log is anchored.
// This is only the *fallback* if we haven't received a real location fix
// yet — as soon as GPS gives us anything, the map jumps to it.
const INITIAL_CENTER: [number, number] = [77.5900, 13.1258];
// 16 keeps the initial view at street-level so when GPS gives us the real
// fix and we jump to zoom 17, it's a small correction not a dramatic
// re-scale. Users were reading the pre-fix wide view as "wrong location".
const INITIAL_ZOOM = 16;

const PATH_STYLE: Record<LayerId, { color: string; width: number }> = {
  corrected: { color: "#3b82f6", width: 4 },
  smoothed:  { color: "#8b5cf6", width: 5 },
  matched:   { color: "#10b981", width: 6 },
  raw:       { color: "#ef4444", width: 0 },     // rendered as points, not a line
  ellipse:   { color: "#3b82f6", width: 0 },
  route:     { color: "#f59e0b", width: 6 },     // amber — clearly distinct from fused paths
};

const MapView = forwardRef<MapViewHandle, Props>(function MapView(
  { showLayers, syncWith, initialStyle = "dark" },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const correctedRef = useRef<[number, number][]>([]);   // [lon, lat]
  const smoothedRef = useRef<[number, number][]>([]);
  const matchedRef = useRef<[number, number][]>([]);
  const rawRef = useRef<[number, number][]>([]);
  const jumpedToFirstRef = useRef(false);

  // "User is manually panning / pinching / rotating" flag. When true we stop
  // auto-following the vehicle so their gesture doesn't get yanked back on
  // every fused_result. Google Maps navigation UX.
  const userInteractingRef = useRef(false);
  const interactionListenersRef = useRef<Set<(v: boolean) => void>>(new Set());
  const suppressUserInteractionRef = useRef(0);   // ignore camera moves we ourselves triggered

  // Last known vehicle position + heading so recenter() can snap immediately
  // even if no new sample has come in since the user panned away.
  const lastPosRef = useRef<{ lat: number; lon: number; headingRad: number } | null>(null);

  const setUserInteracting = (v: boolean) => {
    if (userInteractingRef.current === v) return;
    userInteractingRef.current = v;
    interactionListenersRef.current.forEach((cb) => cb(v));
  };

  const maybeJumpToFirst = (lat: number, lon: number) => {
    if (jumpedToFirstRef.current || !mapRef.current) return;
    jumpedToFirstRef.current = true;
    suppressUserInteractionRef.current++;
    mapRef.current.jumpTo({ center: [lon, lat], zoom: 17 });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!MAPBOX_TOKEN) {
      // Fail loudly + clearly so we don't waste time debugging a silent blank map
      containerRef.current.innerHTML =
        '<div style="padding:24px;color:#f87171;font-family:monospace;">' +
        "VITE_MAPBOX_TOKEN not set. Add it to .env.local and reload." +
        "</div>";
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_URL[initialStyle],
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      // Google-Maps-style gestures — all on by default in Mapbox GL, but
      // being explicit so future edits don't accidentally break them.
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
      pitchWithRotate: true,
      cooperativeGestures: false,
    });
    mapRef.current = map;

    // Detect real user gestures vs. our own programmatic camera moves.
    // Any drag/rotate/zoom via touch or mouse fires `*start` events with
    // `originalEvent` set. Our easeTo/jumpTo calls don't set that field —
    // that's how we distinguish "you moved the map" from "the marker did".
    const onInteractionStart = (e: any) => {
      if (e?.originalEvent) setUserInteracting(true);
    };
    map.on("dragstart", onInteractionStart);
    map.on("rotatestart", onInteractionStart);
    map.on("pitchstart", onInteractionStart);
    map.on("zoomstart", onInteractionStart);

    // Called after every base-style change to reinstate our custom layers.
    const setupLayers = () => {
      // 3D building extrusions — gives navigation the Google Maps "flying
      // through the city" feel when combined with the tilted camera in
      // followVehicle. Only added on styles that carry the 'composite'
      // vector source (streets, satellite-streets).
      try {
        if (map.getSource("composite") && !map.getLayer("beacon-3d-buildings")) {
          const labelLayer = map.getStyle().layers?.find(
            (l: any) => l.type === "symbol" && l.layout?.["text-field"],
          );
          map.addLayer(
            {
              id: "beacon-3d-buildings",
              source: "composite",
              "source-layer": "building",
              filter: ["==", "extrude", "true"],
              type: "fill-extrusion",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#3a4353",
                "fill-extrusion-height": [
                  "interpolate", ["linear"], ["zoom"],
                  14, 0,
                  15.05, ["get", "height"],
                ],
                "fill-extrusion-base": [
                  "interpolate", ["linear"], ["zoom"],
                  14, 0,
                  15.05, ["get", "min_height"],
                ],
                "fill-extrusion-opacity": 0.7,
              },
            } as any,
            labelLayer?.id,
          );
        }
      } catch {
        // If the style doesn't have building extrusions we just skip — the
        // map still works fine, just without the 3D scenery.
      }

      // Route layer (nav): drawn *underneath* corrected so the fused line
      // sits on top and reads as "where we actually are" vs "where we planned".
      if (showLayers.includes("route")) {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
        });
        map.addLayer({
          id: "route-halo",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": PATH_STYLE.route.color,
            "line-width": PATH_STYLE.route.width + 4,
            "line-opacity": 0.25,
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": PATH_STYLE.route.color,
            "line-width": PATH_STYLE.route.width,
            "line-opacity": 0.9,
          },
        });
      }

      // Path layers as GeoJSON sources — updates via setData(), no re-render.
      for (const id of ["corrected", "smoothed", "matched"] as const) {
        if (!showLayers.includes(id)) continue;
        map.addSource(id, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
        });
        map.addLayer({
          id,
          type: "line",
          source: id,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": PATH_STYLE[id].color,
            "line-width": PATH_STYLE[id].width,
            "line-opacity": 0.9,
          },
        });
      }

      if (showLayers.includes("raw")) {
        map.addSource("raw", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "raw",
          type: "circle",
          source: "raw",
          paint: {
            "circle-radius": 5,
            "circle-color": PATH_STYLE.raw.color,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
            "circle-opacity": 0.85,
          },
        });
      }

      if (showLayers.includes("ellipse")) {
        map.addSource("ellipse", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[]] } },
        });
        map.addLayer({
          id: "ellipse",
          type: "fill",
          source: "ellipse",
          paint: {
            "fill-color": PATH_STYLE.ellipse.color,
            "fill-opacity": 0.15,
          },
        });
        map.addLayer({
          id: "ellipse-outline",
          type: "line",
          source: "ellipse",
          paint: { "line-color": PATH_STYLE.ellipse.color, "line-width": 1, "line-opacity": 0.6 },
        });
      }

      if (!markerRef.current) {
        // Vehicle marker: Google-Maps-style blue dot — solid centre, white
        // ring, translucent halo. Reads instantly as "you are here" without
        // competing visually with the fused path lines.
        const el = document.createElement("div");
        el.style.width = "18px";
        el.style.height = "18px";
        el.style.borderRadius = "50%";
        el.style.background = "#3b82f6";
        el.style.border = "3px solid #ffffff";
        el.style.boxShadow =
          "0 0 0 6px rgba(59,130,246,0.22), 0 2px 8px rgba(0,0,0,0.45)";
        markerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat(INITIAL_CENTER)
          .addTo(map);
      }

      // Repaint any accumulated data (e.g. after a style change)
      if (correctedRef.current.length > 0) {
        const src = map.getSource("corrected") as mapboxgl.GeoJSONSource | undefined;
        src?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: correctedRef.current } });
      }
      if (rawRef.current.length > 0) {
        const src = map.getSource("raw") as mapboxgl.GeoJSONSource | undefined;
        src?.setData({
          type: "FeatureCollection",
          features: rawRef.current.map(([lo, la]) => ({
            type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lo, la] },
          })),
        });
      }
    };

    map.on("load", setupLayers);
    // After every setStyle(), Mapbox wipes custom sources+layers.
    // style.load fires when the new style finishes loading — reinstate.
    map.on("style.load", () => {
      if (map.isStyleLoaded()) setupLayers();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera sync between paired maps — mirror the last position we
  // followed to the sibling map. Simpler + more correct than the
  // previous `_mapInternal` trick (which never worked because we don't
  // expose the underlying Mapbox instance through the imperative handle).
  useEffect(() => {
    if (!syncWith?.current) return;
    const iv = setInterval(() => {
      const last = lastPosRef.current;
      if (!last || !syncWith.current) return;
      syncWith.current.panTo(last.lat, last.lon);
    }, 200);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncWith]);

  useImperativeHandle(ref, () => ({
    pushFusedPoint(r) {
      if (!mapRef.current || r.lat == null || r.lon == null) return;
      maybeJumpToFirst(r.lat, r.lon);
      correctedRef.current.push([r.lon, r.lat]);
      const src = mapRef.current.getSource("corrected") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: correctedRef.current } });

      if (showLayers.includes("ellipse") && r.cov_ee != null && r.cov_nn != null && r.cov_en != null) {
        const poly = ellipsePolygon(r.lat, r.lon, r.cov_ee, r.cov_en, r.cov_nn);
        const es = mapRef.current.getSource("ellipse") as mapboxgl.GeoJSONSource | undefined;
        if (es) es.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [poly] } });
      }
    },
    pushRawGpsPoint(lat, lon) {
      if (!mapRef.current) return;
      maybeJumpToFirst(lat, lon);
      rawRef.current.push([lon, lat]);
      const src = mapRef.current.getSource("raw") as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: rawRef.current.map(([lo, la]) => ({
          type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lo, la] },
        })),
      });
      if (markerRef.current) markerRef.current.setLngLat([lon, lat]);
    },
    followVehicle(lat, lon, headingRad) {
      if (!mapRef.current) return;
      lastPosRef.current = { lat, lon, headingRad };
      maybeJumpToFirst(lat, lon);
      // Marker always follows the vehicle, even during user interaction —
      // that just means "here's where you are" not "here's where the camera is".
      markerRef.current?.setLngLat([lon, lat]);
      if (userInteractingRef.current) return;
      suppressUserInteractionRef.current++;
      mapRef.current.easeTo({
        center: [lon, lat],
        bearing: (headingRad * 180) / Math.PI,
        pitch: 62,               // steep tilt so 3D buildings read as a skyline
        zoom: Math.max(mapRef.current.getZoom(), 17.5),
        duration: 400,
        essential: true,
      });
    },
    panTo(lat, lon) {
      if (!mapRef.current) return;
      const prevHeading = lastPosRef.current?.headingRad ?? 0;
      lastPosRef.current = { lat, lon, headingRad: prevHeading };
      maybeJumpToFirst(lat, lon);
      markerRef.current?.setLngLat([lon, lat]);
      if (userInteractingRef.current) return;
      suppressUserInteractionRef.current++;
      mapRef.current.easeTo({
        center: [lon, lat],
        duration: 500,
        essential: true,
      });
    },
    fitBounds(a, b) {
      if (!mapRef.current) return;
      suppressUserInteractionRef.current++;
      // Reset pitch/bearing so the preview reads as an overview rather than
      // continuing whatever nav-mode camera we had. Real navigation kicks
      // the pitch back up on the next followVehicle().
      const bounds = new mapboxgl.LngLatBounds(
        [Math.min(a.lon, b.lon), Math.min(a.lat, b.lat)],
        [Math.max(a.lon, b.lon), Math.max(a.lat, b.lat)],
      );
      mapRef.current.fitBounds(bounds, {
        padding: { top: 120, bottom: 260, left: 60, right: 60 },
        pitch: 0,
        bearing: 0,
        duration: 700,
        maxZoom: 15.5,
        essential: true,
      });
    },
    setMatchedPath(points) {
      if (!mapRef.current) return;
      matchedRef.current = points.map((p) => [p.lon, p.lat]);
      const src = mapRef.current.getSource("matched") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: matchedRef.current } });
    },
    setSmoothedPath(points) {
      if (!mapRef.current) return;
      smoothedRef.current = points.map((p) => [p.lon, p.lat]);
      const src = mapRef.current.getSource("smoothed") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: smoothedRef.current } });
    },
    setRoute(geometry) {
      if (!mapRef.current) return;
      const src = mapRef.current.getSource("route") as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: geometry ?? [] },
      });
    },
    setStyle(style) {
      if (!mapRef.current) return;
      mapRef.current.setStyle(STYLE_URL[style]);
    },
    getCenter() {
      if (!mapRef.current) return null;
      const c = mapRef.current.getCenter();
      return { lat: c.lat, lon: c.lng };
    },
    recenter() {
      // Drop the "user is driving the camera" flag AND immediately snap the
      // camera to the last known vehicle position — Google-Maps recenter:
      // pan + zoom in + tilt to navigation view.
      setUserInteracting(false);
      const last = lastPosRef.current;
      if (!last || !mapRef.current) return;
      suppressUserInteractionRef.current++;
      const currentZoom = mapRef.current.getZoom();
      mapRef.current.easeTo({
        center: [last.lon, last.lat],
        bearing: (last.headingRad * 180) / Math.PI,
        pitch: 62,
        zoom: Math.max(currentZoom, 17.5),
        duration: 600,
        essential: true,
      });
    },
    onUserInteractionChange(cb) {
      interactionListenersRef.current.add(cb);
      return () => {
        interactionListenersRef.current.delete(cb);
      };
    },
    setDestinationMarker(coord) {
      if (!mapRef.current) return;
      if (coord == null) {
        destMarkerRef.current?.remove();
        destMarkerRef.current = null;
        return;
      }
      if (!destMarkerRef.current) {
        const el = document.createElement("div");
        el.style.width = "18px";
        el.style.height = "18px";
        el.style.borderRadius = "50% 50% 50% 0";
        el.style.transform = "rotate(-45deg)";
        el.style.background = "#f59e0b";
        el.style.border = "2px solid #fff";
        el.style.boxShadow = "0 2px 8px rgba(245,158,11,0.5)";
        destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat(coord)
          .addTo(mapRef.current);
      } else {
        destMarkerRef.current.setLngLat(coord);
      }
    },
    clear() {
      correctedRef.current = [];
      smoothedRef.current = [];
      matchedRef.current = [];
      rawRef.current = [];
      const map = mapRef.current;
      if (!map) return;
      for (const id of ["corrected", "smoothed", "matched"] as const) {
        const src = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
        if (src) src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
      }
      const rawSrc = map.getSource("raw") as mapboxgl.GeoJSONSource | undefined;
      if (rawSrc) rawSrc.setData({ type: "FeatureCollection", features: [] });
    },
  }));

  // `touch-action: none` is critical — without it, mobile browsers intercept
  // multi-finger gestures for their own pinch-to-zoom / scroll, and Mapbox
  // never sees the touchmove events needed for rotate + pitch.
  return <div ref={containerRef} className="h-full w-full touch-none" />;
});

export default MapView;

/**
 * Build a 32-vertex ellipse polygon (2-σ) from the 2x2 position covariance.
 * Eigendecomp of the 2x2:
 *   λ± = tr/2 ± sqrt(tr²/4 - det)
 *   rotation = atan2(2·cov_en, cov_ee - cov_nn) / 2
 * Returns [lon, lat] ring closed on itself.
 */
function ellipsePolygon(
  lat: number, lon: number,
  covEE: number, covEN: number, covNN: number,
): [number, number][] {
  const tr = covEE + covNN;
  const det = covEE * covNN - covEN * covEN;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lambdaMajor = tr / 2 + disc;
  const lambdaMinor = Math.max(1, tr / 2 - disc);  // floor at 1 m² to avoid degenerate zero-thin lines
  const semiMajor = 2 * Math.sqrt(lambdaMajor);
  const semiMinor = 2 * Math.sqrt(lambdaMinor);
  const rotation = Math.atan2(2 * covEN, covEE - covNN) / 2;

  const N = 32;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const metersPerDegLat = 111_320;
  const metersPerDegLon = metersPerDegLat * cosLat;

  const ring: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const ex = semiMajor * Math.cos(t);
    const ey = semiMinor * Math.sin(t);
    // rotate by ellipse orientation (from East axis, in ENU): rotate (ex, ey)
    const east = ex * Math.cos(rotation) - ey * Math.sin(rotation);
    const north = ex * Math.sin(rotation) + ey * Math.cos(rotation);
    const dLon = east / metersPerDegLon;
    const dLat = north / metersPerDegLat;
    ring.push([lon + dLon, lat + dLat]);
  }
  return ring;
}
