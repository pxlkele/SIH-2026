// Defaults to the public demo server; set OSRM_URL to a self-hosted
// instance (see osrm/ — build-extract.sh + Dockerfile, deployed as its
// own Railway service) to avoid its hard 10-coordinate cap and the
// availability risk of a shared free API during the actual demo.
const OSRM_BASE_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const OSRM_MATCH_URL = `${OSRM_BASE_URL}/match/v1/driving`;

// The public OSRM demo server hard-caps /match requests at 10 trace
// coordinates (confirmed empirically — HTTP 400 "TooBig" above that, not
// a soft rate limit). Our self-hosted instance raises this to 100 (also
// its own explicit default, set via --max-matching-size in osrm/Dockerfile)
// — OSRM_MAX_COORDS lets deployment config pick the right cap for whichever
// server OSRM_URL points at, with a safe margin under the self-hosted 100.
const DEFAULT_MAX_COORDS = process.env.OSRM_URL ? 90 : 10;
const OSRM_MAX_COORDS = process.env.OSRM_MAX_COORDS ? Number(process.env.OSRM_MAX_COORDS) : DEFAULT_MAX_COORDS;

// Buffers fused positions for one session and periodically snaps them to
// real roads via OSRM's map-matching API.
//
// Buffer holds the last `bufferWindowMs` of points by their own
// timestamp_ms (not wall-clock) so it behaves the same whether points
// arrive live at ~50Hz or all at once from a replayed log. Every
// `intervalMs` (wall-clock — this part IS about pacing OSRM calls, not
// data density) the buffer is subsampled down to ~1 point per
// `subsampleMs` and POSTed as a batch.
function createMapMatcher({
  onMatchedPath, onWarn, intervalMs = 5000, subsampleMs = 500, bufferWindowMs = 5000, maxPoints = OSRM_MAX_COORDS,
}) {
  let buffer = []; // { lat, lon, timestamp_ms }
  let lastMatchedPath = null;

  function addPoint(point) {
    if (point.lat == null || point.lon == null) return;
    buffer.push({ lat: point.lat, lon: point.lon, timestamp_ms: point.timestamp_ms });
    const cutoff = point.timestamp_ms - bufferWindowMs;
    buffer = buffer.filter((p) => p.timestamp_ms >= cutoff);
  }

  function subsample(points) {
    const out = [];
    let lastTs = -Infinity;
    for (const p of points) {
      if (p.timestamp_ms - lastTs >= subsampleMs) {
        out.push(p);
        lastTs = p.timestamp_ms;
      }
    }
    return out;
  }

  async function dispatch() {
    // Keep the most recent `maxPoints` — OSRM needs at least 2 coordinates
    // and the public server rejects a request over the cap outright.
    const points = subsample(buffer).slice(-maxPoints);
    if (points.length < 2) return;

    const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
    const url = `${OSRM_MATCH_URL}/${coords}?geometries=geojson&overview=full`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.matchings?.length) {
        onWarn?.(`no match: ${data.code}${data.message ? ' — ' + data.message : ''}`);
        return;
      }
      const matchedPath = data.matchings[0].geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
      lastMatchedPath = matchedPath;
      onMatchedPath(matchedPath);
    } catch (err) {
      onWarn?.(`request failed: ${err.message}`);
    }
  }

  const timer = setInterval(dispatch, intervalMs);

  return {
    addPoint,
    flush: dispatch,
    getLastMatchedPath: () => lastMatchedPath,
    stop: () => clearInterval(timer),
  };
}

module.exports = { createMapMatcher };
