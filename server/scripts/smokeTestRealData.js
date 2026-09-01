// Smoke-tests /replay/:socketId against a real device capture (not synth
// data). Connects a socket, POSTs data/real/ios_test_2026-08-24.csv to the
// replay endpoint, and checks that fused_result state reaches "running"
// after the 2nd GPS fix and stays there.
// Requires a running server: node index.js (in server/)
// Usage: node server/scripts/smokeTestRealData.js

const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const CSV_PATH = path.join(__dirname, '..', '..', 'data', 'real', 'ios_test_2026-08-24.csv');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4000';

async function main() {
  const socket = io(BASE_URL);
  const results = [];

  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  console.log('connected as', socket.id);

  socket.on('fused_result', (r) => results.push(r));
  socket.on('sample_rejected', (r) => console.error('REJECTED (unexpected):', r));

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const res = await fetch(`${BASE_URL}/replay/${socket.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  const replayResponse = await res.json();
  console.log('replay response:', replayResponse);

  // give the fused_result events a moment to arrive over the socket
  await new Promise((r) => setTimeout(r, 1000));

  const states = results.map((r) => r.state);
  const firstRunningIdx = states.indexOf('running');

  console.log(`received ${results.length} fused_result events`);
  console.log('state sequence:', states.join(' -> '));

  let ok = true;
  if (replayResponse.rowsRejected !== 0) {
    console.error(`FAIL: ${replayResponse.rowsRejected} rows rejected as malformed`);
    ok = false;
  }
  if (results.length !== replayResponse.rowsSent) {
    console.error(`FAIL: got ${results.length} fused_result events for ${replayResponse.rowsSent} rows sent`);
    ok = false;
  }
  if (firstRunningIdx === -1) {
    console.error('FAIL: never reached state "running"');
    ok = false;
  } else if (states.slice(firstRunningIdx).some((s) => s !== 'running')) {
    console.error('FAIL: dropped out of "running" once reached');
    ok = false;
  } else {
    const last = results[results.length - 1];
    console.log(`last fused position: lat=${last.lat} lon=${last.lon} heading_rad=${last.heading_rad}`);
  }

  console.log(ok ? 'REAL DATA SMOKE TEST PASSED' : 'REAL DATA SMOKE TEST FAILED');
  socket.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
