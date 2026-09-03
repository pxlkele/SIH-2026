/**
 * Frame conversions. Ports of model/frames.py — see that file for the design.
 * Kept deliberately literal so the TS + Python filters produce matching output
 * on the same input.
 */

export const EARTH_RADIUS_M = 6_378_137;

export interface ENUOrigin {
  latDeg: number;
  lonDeg: number;
  cosLat: number;
}

export function makeOrigin(latDeg: number, lonDeg: number): ENUOrigin {
  return { latDeg, lonDeg, cosLat: Math.cos((latDeg * Math.PI) / 180) };
}

/** Equirectangular projection to local East/North metres. */
export function latLonToEN(latDeg: number, lonDeg: number, origin: ENUOrigin): [number, number] {
  const dLat = ((latDeg - origin.latDeg) * Math.PI) / 180;
  const dLon = ((lonDeg - origin.lonDeg) * Math.PI) / 180;
  return [EARTH_RADIUS_M * dLon * origin.cosLat, EARTH_RADIUS_M * dLat];
}

export function enToLatLon(eastM: number, northM: number, origin: ENUOrigin): [number, number] {
  const dLat = northM / EARTH_RADIUS_M;
  const dLon = eastM / (EARTH_RADIUS_M * origin.cosLat);
  return [origin.latDeg + (dLat * 180) / Math.PI, origin.lonDeg + (dLon * 180) / Math.PI];
}

/** Yaw-only integration. Vehicle roughly level. */
export function integrateHeading(headingRad: number, gyroZ: number, dt: number): number {
  return wrapPi(headingRad + gyroZ * dt);
}

/**
 * Rotate horizontal device-frame acceleration to world-frame (E, N).
 * Body frame: +x forward, +y right. Heading = East-of-North (compass).
 *   forward_world = (sin θ,  cos θ);  right_world = (cos θ, -sin θ).
 */
export function deviceAccelToWorld(
  accelX: number,
  accelY: number,
  headingRad: number,
): [number, number] {
  const c = Math.cos(headingRad);
  const s = Math.sin(headingRad);
  return [accelX * s + accelY * c, accelX * c - accelY * s];
}

function wrapPi(a: number): number {
  return ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
}
