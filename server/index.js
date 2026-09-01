const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { spawnModelSession } = require('./modelBridge');
const db = require('./db');
const { createMapMatcher } = require('./mapMatch');

// '*' by default for now (hackathon speed); set CORS_ORIGIN to Charvi's
// deployed frontend URL once it exists, to lock this down.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.text({ type: 'text/csv', limit: '25mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN }
});

app.get('/', (req, res) => {
  res.send('Server is alive');
});

// data_schema.md — required per sample; gps_* fields are nullable.
const REQUIRED_FIELDS = ['timestamp_ms', 'accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z'];
const NULLABLE_FIELDS = ['gps_lat', 'gps_lon', 'gps_accuracy_m'];

function validateSample(payload) {
  if (typeof payload !== 'object' || payload === null) return 'sample must be an object';
  for (const field of REQUIRED_FIELDS) {
    const v = payload[field];
    if (typeof v !== 'number' || Number.isNaN(v)) {
      return `missing/invalid required field: ${field}`;
    }
  }
  for (const field of NULLABLE_FIELDS) {
    const v = payload[field];
    if (v !== null && v !== undefined && (typeof v !== 'number' || Number.isNaN(v))) {
      return `invalid nullable field: ${field}`;
    }
  }
  return null;
}

function csvRowToSample(row) {
  return {
    timestamp_ms: Number(row.timestamp_ms),
    accel_x: Number(row.accel_x),
    accel_y: Number(row.accel_y),
    accel_z: Number(row.accel_z),
    gyro_x: Number(row.gyro_x),
    gyro_y: Number(row.gyro_y),
    gyro_z: Number(row.gyro_z),
    gps_lat: row.gps_lat === '' ? null : Number(row.gps_lat),
    gps_lon: row.gps_lon === '' ? null : Number(row.gps_lon),
    gps_accuracy_m: row.gps_accuracy_m === '' ? null : Number(row.gps_accuracy_m),
  };
}

io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  const sessionId = db.createSession('live');
  socket.emit('session_started', { sessionId });

  // One serve_stdio.py subprocess per live session — holds the filter state.
  const modelSession = spawnModelSession();
  const matcher = createMapMatcher({
    onMatchedPath: (path) => socket.emit('matched_path', path),
    onWarn: (msg) => console.warn(`[mapmatch:${socket.id}]`, msg),
  });
  modelSession.onResult((result) => {
    db.insertFusedResult(sessionId, result);
    socket.emit('fused_result', result);
    if (result.state === 'running') matcher.addPoint(result);
  });
  modelSession.onError((err) => console.error(`[model:${socket.id}]`, err.message));

  socket.on('sample', (payload) => {
    const error = validateSample(payload);
    if (error) {
      socket.emit('sample_rejected', { error, sample: payload });
      return;
    }
    db.insertRawSample(sessionId, payload);
    modelSession.send(payload);
  });

  // Lets a frontend that mounted its map late (or missed earlier
  // 'matched_path' events) catch up without waiting for the next batch.
  socket.on('get_matched_path', (cb) => {
    if (typeof cb === 'function') cb(matcher.getLastMatchedPath());
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    modelSession.kill();
    matcher.stop();
    db.endSession(sessionId);
  });
});

// Replayed-CSV fallback path (for Charvi's UI when live sensor streaming
// isn't available). POST raw CSV text conforming to data_schema.md;
// fused results are emitted to the given socket as 'fused_result', same
// event the live path uses, so the frontend doesn't need two code paths.
app.post('/replay/:socketId', async (req, res) => {
  const targetSocket = io.sockets.sockets.get(req.params.socketId);
  if (!targetSocket) {
    return res.status(404).json({ error: `no connected socket with id ${req.params.socketId}` });
  }
  if (typeof req.body !== 'string' || !req.body.trim()) {
    return res.status(400).json({ error: 'expected raw CSV body, Content-Type: text/csv' });
  }

  const rows = [];
  try {
    await new Promise((resolve, reject) => {
      Readable.from(req.body)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });
  } catch (err) {
    return res.status(400).json({ error: `CSV parse failed: ${err.message}` });
  }

  const sessionId = db.createSession('replay');
  const replaySession = spawnModelSession();
  const matcher = createMapMatcher({
    onMatchedPath: (path) => targetSocket.emit('matched_path', path),
    onWarn: (msg) => console.warn(`[mapmatch:replay:${req.params.socketId}]`, msg),
  });
  replaySession.onResult((result) => {
    db.insertFusedResult(sessionId, result);
    targetSocket.emit('fused_result', result);
    if (result.state === 'running') matcher.addPoint(result);
  });
  replaySession.onError((err) => console.error(`[model:replay:${req.params.socketId}]`, err.message));
  // Replayed rows land near-instantly rather than over real time, so the
  // matcher's normal 5s wall-clock timer may never fire before the
  // subprocess exits — flush whatever's buffered once it's done.
  replaySession.onExit(() => {
    db.endSession(sessionId);
    matcher.flush().finally(() => matcher.stop());
  });

  let rowsSent = 0;
  let rowsRejected = 0;
  for (const row of rows) {
    const sample = csvRowToSample(row);
    const error = validateSample(sample);
    if (error) {
      rowsRejected += 1;
      continue;
    }
    db.insertRawSample(sessionId, sample);
    replaySession.send(sample);
    rowsSent += 1;
  }
  replaySession.end();

  res.json({ sessionId, rowsSent, rowsRejected });
});

// Session history — lets the frontend list past runs and replay one by id.
app.get('/sessions', (req, res) => {
  res.json(db.listSessions());
});

app.get('/sessions/:id', (req, res) => {
  const run = db.getSessionRun(req.params.id);
  if (!run) {
    return res.status(404).json({ error: `no session with id ${req.params.id}` });
  }
  res.json(run);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
