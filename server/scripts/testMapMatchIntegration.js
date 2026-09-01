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

async function main() {
  const socket = io('http://localhost:4000');
  let matchedPath = null;
  let fusedCount = 0;

  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  console.log('connected as', socket.id);

  socket.on('fused_result', () => { fusedCount++; });
  socket.on('matched_path', (path) => { matchedPath = path; });

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const res = await fetch(`http://localhost:4000/replay/${socket.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  console.log('replay response:', await res.json());

  // Give the subprocess time to exit and the matcher to flush + call OSRM.
  await new Promise((r) => setTimeout(r, 10000));

  console.log(`fused_result events: ${fusedCount}`);
  console.log('matched_path received:', matchedPath ? `${matchedPath.length} points` : 'NONE');

  const ok = fusedCount > 0 && matchedPath && matchedPath.length > 0;
  console.log(ok ? 'MAP-MATCH INTEGRATION TEST PASSED' : 'MAP-MATCH INTEGRATION TEST FAILED');
  socket.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
