import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import MapView, { type MapViewHandle } from "../map/MapView";
import { useFusionStream } from "../data/useFusionStream";

/**
 * `/app` — the product view. Single fused path, marker, confidence ellipse,
 * DR-active badge, follow-vehicle camera. No pitch instrumentation.
 */
export default function MainApp() {
  const mapRef = useRef<MapViewHandle>(null);
  const { latestFused, isDRActive } = useFusionStream({
    onFusedResult: (r) => mapRef.current?.pushFusedPoint(r),
  });

  useEffect(() => {
    if (latestFused?.lat != null && latestFused?.lon != null) {
      mapRef.current?.followVehicle(latestFused.lat, latestFused.lon, latestFused.heading_rad ?? 0);
    }
  }, [latestFused]);

  return (
    <div className="relative h-screen w-screen">
      <MapView ref={mapRef} showLayers={["corrected", "ellipse"]} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <Link
          to="/"
          className="pointer-events-auto rounded-md bg-black/60 px-3 py-1.5 text-xs font-medium text-neutral-200 backdrop-blur hover:bg-black/80"
        >
          ← Home
        </Link>
        {isDRActive && (
          <div className="pointer-events-auto rounded-md bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-black shadow-lg">
            DEAD RECKONING ACTIVE
          </div>
        )}
      </div>
    </div>
  );
}
