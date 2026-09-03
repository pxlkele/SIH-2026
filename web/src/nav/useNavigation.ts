import { useCallback, useEffect, useRef, useState } from "react";
import { distanceM, getRoute, type Route, type RouteStep } from "./mapboxApi";

interface Options {
  /** Current vehicle position, updated every fused_result. */
  currentPos: { lat: number; lon: number } | null;
  /** Advance to next step when we're within this many metres of the current maneuver point. */
  advanceRadiusM?: number;
}

interface Destination {
  name: string;
  lat: number;
  lon: number;
}

/**
 * Client-side navigation state. Given a destination and a live current position,
 * fetches a route from Mapbox Directions and tracks progress along it — advancing
 * the "current step" as the vehicle approaches each maneuver point.
 */
export function useNavigation({ currentPos, advanceRadiusM = 40 }: Options) {
  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const routeStartPosRef = useRef<{ lat: number; lon: number } | null>(null);

  const startNavigation = useCallback(
    async (dest: Destination) => {
      if (!currentPos) {
        setError("Waiting for GPS fix...");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const r = await getRoute([currentPos.lon, currentPos.lat], [dest.lon, dest.lat]);
        setRoute(r);
        setDestination(dest);
        setCurrentStepIdx(0);
        routeStartPosRef.current = { ...currentPos };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to plan route");
        setRoute(null);
        setDestination(null);
      } finally {
        setLoading(false);
      }
    },
    [currentPos],
  );

  const cancel = useCallback(() => {
    setDestination(null);
    setRoute(null);
    setCurrentStepIdx(0);
    setError(null);
    routeStartPosRef.current = null;
  }, []);

  // Advance step as we approach each maneuver point
  useEffect(() => {
    if (!route || !currentPos) return;
    // Look up to 3 steps ahead — if we blow past a maneuver during a GPS outage,
    // don't get stuck on it forever
    for (let i = currentStepIdx; i < Math.min(currentStepIdx + 3, route.steps.length); i++) {
      const step = route.steps[i];
      const [lon, lat] = step.location;
      if (distanceM(currentPos.lat, currentPos.lon, lat, lon) < advanceRadiusM) {
        if (i + 1 !== currentStepIdx) setCurrentStepIdx(i + 1);
        return;
      }
    }
  }, [currentPos, route, currentStepIdx, advanceRadiusM]);

  const currentStep: RouteStep | null =
    route && currentStepIdx < route.steps.length ? route.steps[currentStepIdx] : null;
  const nextStep: RouteStep | null =
    route && currentStepIdx + 1 < route.steps.length ? route.steps[currentStepIdx + 1] : null;

  // Remaining distance/time — from current step onward
  const remainingDistanceM = route
    ? route.steps.slice(currentStepIdx).reduce((s, x) => s + x.distanceM, 0)
    : 0;
  const remainingDurationS = route
    ? route.steps.slice(currentStepIdx).reduce((s, x) => s + x.durationS, 0)
    : 0;

  const arrived = route != null && currentStepIdx >= route.steps.length;

  return {
    destination,
    route,
    currentStep,
    nextStep,
    currentStepIdx,
    remainingDistanceM,
    remainingDurationS,
    arrived,
    loading,
    error,
    startNavigation,
    cancel,
  };
}
