const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,        -- 'live' | 'replay'
    started_at INTEGER NOT NULL, -- server clock, unix ms
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS raw_samples (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    timestamp_ms INTEGER NOT NULL,
    accel_x REAL NOT NULL, accel_y REAL NOT NULL, accel_z REAL NOT NULL,
    gyro_x REAL NOT NULL, gyro_y REAL NOT NULL, gyro_z REAL NOT NULL,
    gps_lat REAL, gps_lon REAL, gps_accuracy_m REAL
  );
  CREATE INDEX IF NOT EXISTS idx_raw_samples_session ON raw_samples(session_id);

  CREATE TABLE IF NOT EXISTS fused_results (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    timestamp_ms INTEGER NOT NULL,
    state TEXT NOT NULL,
    lat REAL, lon REAL, heading_rad REAL, std_e_m REAL, std_n_m REAL,
    gps_used INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fused_results_session ON fused_results(session_id);
`);

const stmts = {
  createSession: db.prepare('INSERT INTO sessions (id, source, started_at) VALUES (?, ?, ?)'),
  endSession: db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?'),
  getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  listSessions: db.prepare('SELECT * FROM sessions ORDER BY started_at DESC'),
  insertRawSample: db.prepare(`
    INSERT INTO raw_samples
      (session_id, timestamp_ms, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, gps_lat, gps_lon, gps_accuracy_m)
    VALUES (@session_id, @timestamp_ms, @accel_x, @accel_y, @accel_z, @gyro_x, @gyro_y, @gyro_z, @gps_lat, @gps_lon, @gps_accuracy_m)
  `),
  insertFusedResult: db.prepare(`
    INSERT INTO fused_results
      (session_id, timestamp_ms, state, lat, lon, heading_rad, std_e_m, std_n_m, gps_used)
    VALUES (@session_id, @timestamp_ms, @state, @lat, @lon, @heading_rad, @std_e_m, @std_n_m, @gps_used)
  `),
  getRawSamples: db.prepare('SELECT * FROM raw_samples WHERE session_id = ? ORDER BY timestamp_ms'),
  getFusedResults: db.prepare('SELECT * FROM fused_results WHERE session_id = ? ORDER BY timestamp_ms'),
};

function createSession(source) {
  const id = crypto.randomUUID();
  stmts.createSession.run(id, source, Date.now());
  return id;
}

function endSession(id) {
  stmts.endSession.run(Date.now(), id);
}

function insertRawSample(sessionId, sample) {
  stmts.insertRawSample.run({
    session_id: sessionId,
    timestamp_ms: sample.timestamp_ms,
    accel_x: sample.accel_x,
    accel_y: sample.accel_y,
    accel_z: sample.accel_z,
    gyro_x: sample.gyro_x,
    gyro_y: sample.gyro_y,
    gyro_z: sample.gyro_z,
    gps_lat: sample.gps_lat ?? null,
    gps_lon: sample.gps_lon ?? null,
    gps_accuracy_m: sample.gps_accuracy_m ?? null,
  });
}

function insertFusedResult(sessionId, result) {
  stmts.insertFusedResult.run({
    session_id: sessionId,
    timestamp_ms: result.timestamp_ms,
    state: result.state,
    lat: result.lat ?? null,
    lon: result.lon ?? null,
    heading_rad: result.heading_rad ?? null,
    std_e_m: result.std_e_m ?? null,
    std_n_m: result.std_n_m ?? null,
    gps_used: result.gps_used ? 1 : 0,
  });
}

function getSessionRun(id) {
  const session = stmts.getSession.get(id);
  if (!session) return null;
  return {
    session,
    rawSamples: stmts.getRawSamples.all(id),
    fusedResults: stmts.getFusedResults.all(id),
  };
}

function listSessions() {
  return stmts.listSessions.all();
}

module.exports = {
  createSession,
  endSession,
  insertRawSample,
  insertFusedResult,
  getSessionRun,
  listSessions,
};
