# Aleena — To-Do

**Role:** Backend — data ingestion + storage layer (Node/Express)

## Setup — install / download first

### System-level (once per machine)
- [ ] **Node.js LTS** (v20 or v22) — https://nodejs.org
- [ ] **Python 3.11+** — the backend spawns `model/serve_stdio.py` as a subprocess, so Python must be available on whatever machine runs the backend
- [ ] Git (probably already installed)

### Backend Node deps (create `server/package.json`)
Minimum:
- [ ] `express` (^4)
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
- [ ] Define + agree the **live-ingestion schema** with Angad + Palak (blocker for whole team)
- [ ] WebSocket / Socket.io endpoint that accepts the live sensor stream
- [ ] Endpoint that accepts a replayed CSV log conforming to `data_schema.md` (fallback path for Charvi's UI)
- [ ] Validate incoming samples; reject malformed rows without killing the stream

## Storage
Pick one — recommendation is SQLite for the hackathon:
- [ ] **SQLite via `better-sqlite3`** *(recommended)* — one file, zero config, easiest to demo
- [ ] *Or* flat JSON/CSV per session — even simpler, fine if we don't need to query historical runs
- [ ] *Not* Postgres — overkill for 10 days

Then:
- [ ] Persist raw samples + fused output per session (enough to reconstruct a run for debugging / video re-record)
- [ ] Session ID model so frontend can replay a specific run

## Model integration
- [ ] Spawn `python3 model/serve_stdio.py` once per user session (one subprocess per socket connection)
- [ ] Pipe incoming samples in as JSON-per-line on stdin; read fused results as JSON-per-line from stdout
- [ ] Broadcast fused output back over WebSocket to the frontend
- [ ] Full API contract is in `model/README.md :: Inference API`

## Deploy
- [ ] Pick a backend host (open item) — factor in WebSocket support, subprocess/Python availability, and cold-start latency for the live demo
- [ ] Deploy backend + smoke-test against Charvi's Vercel frontend
- [ ] Test end-to-end in venue-like network conditions
