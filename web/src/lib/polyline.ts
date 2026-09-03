/**
 * Google encoded polyline format — the format Mapbox Static Images API
 * uses for path overlays. Small, self-contained, no dep.
 *
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function encodePolyline(points: Array<[number, number]>): string {
  // points: [[lat, lon], ...]
  let out = "";
  let prevLat = 0;
  let prevLon = 0;
  for (const [lat, lon] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lonE5 = Math.round(lon * 1e5);
    out += encodeSigned(latE5 - prevLat);
    out += encodeSigned(lonE5 - prevLon);
    prevLat = latE5;
    prevLon = lonE5;
  }
  return out;
}

function encodeSigned(v: number): string {
  let shifted = v << 1;
  if (v < 0) shifted = ~shifted;
  return encodeUnsigned(shifted);
}

function encodeUnsigned(v: number): string {
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v = v >>> 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}
