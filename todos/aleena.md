# Aleena — To-Do

**Role:** Backend — data ingestion + storage layer (Node/Express)

## Setup — install / download first

### System-level (once per machine)
- [ ] **Node.js LTS** (v20 or v22) — https://nodejs.org
- [ ] **Python 3.11+** — the backend spawns `model/serve_stdio.py` as a subprocess, so Python must be available on whatever machine runs the backend
- [ ] Git (probably already installed)

### Backend Node deps (create `server/package.json`)
Minimum:
- [x] `express` (^5) — using v5, not v4; socket.io doesn't route through express so this is safe, just watch for v5's changed path-matching syntax (bare `*` wildcards, `req.query`) if adding HTTP routes later
- [ ] `socket.io` (^4)
- [ ] `cors` (^2)
- [ ] `nodemon` (^3, dev-only)

Optional but useful:
- [ ] `pino` or `morgan` — request/event logging (will save time debugging the live demo)
- [ ] `dotenv` — if she wants `.env` for host/port config
- [ ] `csv-parser` — for the replayed-log fallback path (reading Raga's CSV)
- [ ] `better-sqlite3` — if storage = SQLite (see Storage section)

### Python side (for the subprocess)
- [ ] `cd model && pip install -r requirements.txt` — numpy + pandas, that's it. `serve_stdio.py` is otherwise stdlib.

### Testing / dev tools (nice-to-have)
- [ ] `wscat` (`npm i -g wscat`) — manual WebSocket poking
- [ ] `socket.io-client` — for any programmatic tests

### What NOT to install
- The Kalman filter itself — already in `model/`. Just spawn `serve_stdio.py`; parity with batch is proven by `model/smoke_stdio.py`.

## Ingestion
- [x] Define + agree the **live-ingestion schema** with Angad + Palak (blocker for whole team) — locked in `data_schema.md`, matches `serve_stdio.py`'s contract exactly
- [x] WebSocket / Socket.io endpoint that accepts the live sensor stream — `socket.on('sample', ...)` in `index.js`
- [x] Endpoint that accepts a replayed CSV log conforming to `data_schema.md` (fallback path for Charvi's UI) — `POST /replay/:socketId`, raw CSV body, parsed with `csv-parser` (handles CRLF correctly, unlike a hand-rolled split)
- [x] Validate incoming samples; reject malformed rows without killing the stream — `validateSample()`, emits `sample_rejected` back to the client instead of forwarding to the model

## Storage
Pick one — recommendation is SQLite for the hackathon:
- [ ] **SQLite via `better-sqlite3`** *(recommended)* — one file, zero config, easiest to demo
- [ ] *Or* flat JSON/CSV per session — even simpler, fine if we don't need to query historical runs
- [ ] *Not* Postgres — overkill for 10 days

Then:
- [ ] Persist raw samples + fused output per session (enough to reconstruct a run for debugging / video re-record)
- [ ] Session ID model so frontend can replay a specific run

## Model integration
- [x] Spawn `model/serve_stdio.py` once per user session — `server/modelBridge.js`. Note: spawns `python`, not `python3` — on Windows `python3` is a broken Microsoft Store alias stub; override via `PYTHON_BIN` env var if a machine differs
- [x] Pipe incoming samples in as JSON-per-line on stdin; read fused results as JSON-per-line from stdout — proven against `model/synth/synth_log.csv` in `server/scripts/smokeTestModelBridge.js` (3000/3000 lines, output matches batch runner to <1e-9°). Caught and fixed a CRLF-handling bug in CSV parsing along the way (Windows line endings silently nulled `gps_accuracy_m`)
- [x] Wire `modelBridge` into a socket.io connection — one subprocess per socket in `index.js`, killed on disconnect (verified no orphaned Python processes after disconnect/replay in manual testing)
- [x] Broadcast fused output back over WebSocket to the frontend — `fused_result` event, same event name for both the live path and the `/replay` path so the frontend doesn't need two code paths
- [x] Full API contract is in `model/README.md :: Inference API`

## Deploy
- [ ] Pick a backend host (open item) — factor in WebSocket support, subprocess/Python availability, and cold-start latency for the live demo
- [ ] Deploy backend + smoke-test against Charvi's Vercel frontend
- [ ] Test end-to-end in venue-like network conditions
