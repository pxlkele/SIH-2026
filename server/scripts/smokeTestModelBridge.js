// Smoke-tests modelBridge.js by feeding model/synth/synth_log.csv through
// serve_stdio.py from Node, then cross-checking against the batch output.
//
// Mirrors model/smoke_stdio.py, but proves the Node <-> Python pipe itself
// (JSON framing, stdout buffering, process lifecycle) rather than the
// filter logic, which the Python smoke test already covers.
//
// Requires: `python run_on_log.py synth/synth_log.csv` has been run from
// model/ so model/output/corrected_path.csv exists.
//
// Usage: node server/scripts/smokeTestModelBridge.js

const fs = require('fs');
const path = require('path');
const { spawnModelSession } = require('../modelBridge');

const MODEL_DIR = path.join(__dirname, '..', '..', 'model');
const LOG_PATH = path.join(MODEL_DIR, 'synth', 'synth_log.csv');
const BATCH_OUT_PATH = path.join(MODEL_DIR, 'output', 'corrected_path.csv');

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  const [headerLine, ...rows] = text.split(/\r\n|\n/);
  const headers = headerLine.split(',');
  return rows.map((row) => {
    const cells = row.split(',');
    const record = {};
    headers.forEach((h, i) => {
      const cell = cells[i];
      record[h] = cell === '' ? null : cell;
    });
    return record;
  });
}

function toSample(row) {
  return {
    timestamp_ms: parseInt(row.timestamp_ms, 10),
    accel_x: parseFloat(row.accel_x),
    accel_y: parseFloat(row.accel_y),
    accel_z: parseFloat(row.accel_z),
    gyro_x: parseFloat(row.gyro_x),
    gyro_y: parseFloat(row.gyro_y),
    gyro_z: parseFloat(row.gyro_z),
    gps_lat: row.gps_lat === null ? null : parseFloat(row.gps_lat),
    gps_lon: row.gps_lon === null ? null : parseFloat(row.gps_lon),
    gps_accuracy_m: row.gps_accuracy_m === null ? null : parseFloat(row.gps_accuracy_m),
  };
}

async function main() {
  if (!fs.existsSync(BATCH_OUT_PATH)) {
    console.error(`missing ${BATCH_OUT_PATH} — run "python run_on_log.py synth/synth_log.csv" from model/ first`);
    process.exit(2);
  }

  const rows = parseCsv(LOG_PATH);
  const samples = rows.map(toSample);

  const session = spawnModelSession();
  const results = [];
  let failed = false;

  session.onResult((r) => results.push(r));
  session.onError((err) => {
    failed = true;
    console.error(err.message);
  });

  const exitCode = await new Promise((resolve) => {
    session.onExit(resolve);
    for (const sample of samples) session.send(sample);
    session.end();
  });

  if (exitCode !== 0 && exitCode !== null) {
    console.error(`serve_stdio.py exited with code ${exitCode}`);
    process.exit(1);
  }

  if (results.length !== samples.length) {
    console.error(`line count mismatch: in=${samples.length} out=${results.length}`);
    process.exit(1);
  }
  console.log(`line count OK: ${samples.length} in / ${results.length} out`);

  const errorLines = results.filter((r) => r.error);
  if (errorLines.length) {
    console.error(`got ${errorLines.length} error lines:`, errorLines.slice(0, 3));
    process.exit(1);
  }
  console.log('no error lines');

  const running = results.filter((r) => r.state === 'running');
  if (!running.length) {
    console.error('no RUNNING samples emitted');
    process.exit(1);
  }
  const last = running[running.length - 1];

  const batchRows = parseCsv(BATCH_OUT_PATH);
  const batchLast = batchRows[batchRows.length - 1];

  const dlat = Math.abs(last.lat - parseFloat(batchLast.lat));
  const dlon = Math.abs(last.lon - parseFloat(batchLast.lon));
  if (dlat >= 1e-9 || dlon >= 1e-9 || failed) {
    console.error(`batch/stream mismatch: dlat=${dlat} dlon=${dlon}`);
    process.exit(1);
  }
  console.log(`final position matches batch: lat=${last.lat.toFixed(7)} lon=${last.lon.toFixed(7)}`);
  console.log('smoke test PASSED');
}

main();
