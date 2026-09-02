// Throwaway integration check against a running server (localhost by
// default, or any deployed URL via BACKEND_URL).
// Connects a real socket.io client, sends a valid sample, a malformed one,
// waits for fused_result / sample_rejected, then exercises /replay.
// Usage: node index.js (in one terminal) && node server/scripts/testLiveIntegration.js
//   BACKEND_URL=https://your-app.up.railway.app node server/scripts/testLiveIntegration.js

const { io } = require('socket.io-client');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const socket = io(BASE_URL);

let gotFused = false;
let gotRejected = false;

socket.on('connect', () => {
  console.log('connected as', socket.id);

  socket.emit('sample', {
    timestamp_ms: 1735024800000,
    accel_x: 0.1, accel_y: -0.02, accel_z: 9.81,
    gyro_x: 0.001, gyro_y: -0.002, gyro_z: 0.0,
    gps_lat: 12.9716, gps_lon: 77.5946, gps_accuracy_m: 5.0,
  });

  socket.emit('sample', { timestamp_ms: 1735024800020, accel_x: 'not-a-number' });
});

socket.on('fused_result', (result) => {
  gotFused = true;
  console.log('fused_result:', result);
});

socket.on('sample_rejected', (payload) => {
  gotRejected = true;
  console.log('sample_rejected:', payload);
});

setTimeout(async () => {
  if (!gotFused) { console.error('FAIL: no fused_result received'); process.exitCode = 1; }
  if (!gotRejected) { console.error('FAIL: no sample_rejected received'); process.exitCode = 1; }

  const res = await fetch(`${BASE_URL}/replay/${socket.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: 'timestamp_ms,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,gps_lat,gps_lon,gps_accuracy_m\r\n'
      + '1735024800000,0.1,-0.02,9.81,0.001,-0.002,0.0,12.9716,77.5946,5.0\r\n'
      + '1735024800020,0.12,-0.01,9.80,0.001,-0.001,0.0,,,\r\n',
  });
  const json = await res.json();
  console.log('replay response:', json);
  if (json.rowsSent !== 2 || json.rowsRejected !== 0) {
    console.error('FAIL: unexpected replay counts');
    process.exitCode = 1;
  }

  if (!process.exitCode) console.log('ALL CHECKS PASSED');
  // Set the exit code and let Node exit naturally once handles close, on
  // its own — don't force process.exit(). A forced exit can race with
  // native handle teardown (hits a libuv assertion on Windows).
  socket.close();
}, 1500);
