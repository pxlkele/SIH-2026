// Throwaway integration check: replays the synth log (real movement,
// unlike the stationary real iOS capture) against a running server and
// confirms a 'matched_path' event actually arrives via the replay path's
// flush-on-exit (not the normal 5s wall-clock timer, since replay dumps
// all rows near-instantly).
// Usage: node index.js (in server/) && node server/scripts/testMapMatchIntegration.js

const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const CSV_PATH = path.join(__dirname, '..', '..', 'model', 'synth', 'synth_log.csv');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4000';
// Ceiling only — a safety net against a genuinely hung server (subprocess
// exit + OSRM round trip usually takes well under this), not a guess at
// how long things "should" take.
const WAIT_TIMEOUT_MS = 15000;

async function main() {
  const socket = io(BASE_URL);
  let matchedPath = null;
  let fusedCount = 0;

  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  console.log('connected as', socket.id);

  const matchedPathPromise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), WAIT_TIMEOUT_MS);
    socket.once('matched_path', (path) => {
      clearTimeout(timer);
      resolve(path);
    });
  });
  socket.on('fused_result', () => { fusedCount++; });

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const res = await fetch(`${BASE_URL}/replay/${socket.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  console.log('replay response:', await res.json());

  matchedPath = await matchedPathPromise;

  console.log(`fused_result events: ${fusedCount}`);
  console.log('matched_path received:', matchedPath ? `${matchedPath.length} points` : 'NONE');

  const ok = fusedCount > 0 && matchedPath && matchedPath.length > 0;
  console.log(ok ? 'MAP-MATCH INTEGRATION TEST PASSED' : 'MAP-MATCH INTEGRATION TEST FAILED');
  // Set the exit code and let Node exit naturally once handles close, on
  // its own — don't force process.exit(). A forced exit can race with
  // native handle teardown (hits a libuv assertion on Windows).
  process.exitCode = ok ? 0 : 1;
  socket.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
