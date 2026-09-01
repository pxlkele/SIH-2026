// Throwaway integration check for GET /sessions/:id/smoothed. Replays the
// synth log (known 20s GPS-loss window) to create a session, then fetches
// the smoothed trajectory and sanity-checks it against the live fused
// results already stored for that same session.
// Usage: node index.js (in server/) && node server/scripts/testSmootherEndpoint.js

const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const CSV_PATH = path.join(__dirname, '..', '..', 'model', 'synth', 'synth_log.csv');

async function main() {
  const socket = io(BASE_URL);
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  console.log('connected as', socket.id);

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const replayRes = await fetch(`${BASE_URL}/replay/${socket.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  const { sessionId, rowsSent } = await replayRes.json();
  console.log('replay done:', { sessionId, rowsSent });

  // give the replay subprocess time to finish (results still streaming
  // into storage asynchronously after the HTTP response returns)
  await new Promise((r) => setTimeout(r, 4000));

  const runRes = await fetch(`${BASE_URL}/sessions/${sessionId}`);
  const run = await runRes.json();
  console.log('stored fused_result rows:', run.fusedResults.length);

  const smoothRes = await fetch(`${BASE_URL}/sessions/${sessionId}/smoothed`);
  if (!smoothRes.ok) {
    console.error('FAIL: smoothed endpoint returned', smoothRes.status, await smoothRes.text());
    process.exit(1);
  }
  const smoothed = await smoothRes.json();
  console.log('smoothed rows:', smoothed.length);

  let ok = true;
  if (smoothed.length === 0) {
    console.error('FAIL: smoothed endpoint returned zero rows');
    ok = false;
  }

  // Compare uncertainty (std_e_m) during the middle of the run — the
  // synth log's 20s GPS-loss window — between the live filter's stored
  // fused_result and the RTS-smoothed output. Smoothed should be tighter.
  const midLive = run.fusedResults[Math.floor(run.fusedResults.length / 2)];
  const midSmoothed = smoothed.find((r) => r.timestamp_ms === midLive.timestamp_ms)
    || smoothed[Math.floor(smoothed.length / 2)];
  console.log('mid-run live std_e_m:', midLive.std_e_m, ' | smoothed std_e_m:', midSmoothed.std_e_m);
  if (!(midSmoothed.std_e_m < midLive.std_e_m)) {
    console.error('FAIL: smoothed uncertainty is not tighter than live at mid-run');
    ok = false;
  }

  console.log(ok ? 'SMOOTHER ENDPOINT TEST PASSED' : 'SMOOTHER ENDPOINT TEST FAILED');
  socket.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
