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

### Real sensor data available
- **First real capture is in the repo:** `data/real/ios_test_2026-08-24.csv` — iOS SensorLog, converted through `model/adapters/ios_sensorlog.py`, schema-conformant.
- Only ~1.5 s of data (45 IMU samples, 2 GPS fixes) — enough to smoke-test the `/replay/:socketId` path end-to-end against a real device format, not enough for anything meaningful about live-demo behaviour.
- **Recommended smoke test:** POST this file to `/replay/:socketId` and confirm the resulting `fused_result` events look sane on your side. Everything after fix #2 should have `state: "running"`.
- Longer drive logs land as they come; every new log gets converted to `data/real/*.csv` and is ready for you the same way — no format work on your end.
- See `data/README.md` for full details and the adapter usage.

## Storage
Pick one — recommendation is SQLite for the hackathon:
- [x] **SQLite via `better-sqlite3`** *(recommended)* — `server/db.js`, one file (`server/data.db`, gitignored), zero config

Then:
- [x] Persist raw samples + fused output per session (enough to reconstruct a run for debugging / video re-record) — `raw_samples` / `fused_results` tables, written on both the live socket path and `/replay`
- [x] Session ID model so frontend can replay a specific run — `crypto.randomUUID()` per session (live: on connect, emitted as `session_started`; replay: on `POST /replay`, returned in the response). `GET /sessions` lists runs, `GET /sessions/:id` returns the full raw+fused history for one — verified against the real iOS capture (45/45 rows persisted correctly)

## Model integration
- [x] Spawn `model/serve_stdio.py` once per user session — `server/modelBridge.js`. Note: spawns `python`, not `python3` — on Windows `python3` is a broken Microsoft Store alias stub; override via `PYTHON_BIN` env var if a machine differs
- [x] Pipe incoming samples in as JSON-per-line on stdin; read fused results as JSON-per-line from stdout — proven against `model/synth/synth_log.csv` in `server/scripts/smokeTestModelBridge.js` (3000/3000 lines, output matches batch runner to <1e-9°). Caught and fixed a CRLF-handling bug in CSV parsing along the way (Windows line endings silently nulled `gps_accuracy_m`)
- [x] Wire `modelBridge` into a socket.io connection — one subprocess per socket in `index.js`, killed on disconnect (verified no orphaned Python processes after disconnect/replay in manual testing)
- [x] Broadcast fused output back over WebSocket to the frontend — `fused_result` event, same event name for both the live path and the `/replay` path so the frontend doesn't need two code paths
- [x] Full API contract is in `model/README.md :: Inference API`

## Tier 1 winner-tier features (Palak scoped)

### Post-run RTS-smoothed trajectory endpoint (new, small)
The model now has a `smoother.py` that runs an RTS backward pass over a completed session's samples — result is ~5× tighter than the live filter through GPS outages (**1.39 m mean vs 6.35 m** on the synth 20-s outage). Charvi wants to render this as a third path layer after a session ends.

- [x] Add `GET /sessions/:id/smoothed` (plural `/sessions`, matching the existing `GET /sessions/:id` route, not the singular the note suggested) — pulls raw samples for that session out of SQLite, writes them to a temp CSV, pipes through `smoother.py`, returns a JSON array of `{timestamp_ms, lat, lon, heading_rad, std_e_m, std_n_m, cov_ee, cov_en, cov_nn}`. Temp files cleaned up in a `finally` regardless of outcome.
- [x] Blocks rather than `202`+polling — a full session smooths in well under a second, not worth the extra complexity for the demo
- [x] No changes to live/replay paths — strictly post-run, as scoped

**Found while wiring this up:** `smoother.py`'s own docstring says `python -m model.smoother <in> <out>`, but that invocation actually fails — `ModuleNotFoundError: No module named 'frames'`, because of a bare `from frames import ...` inside that only resolves when run the way `serve_stdio.py` already runs (cwd inside `model/`, plain script invocation, not `-m` from the repo root). Worth fixing the docstring/adding a proper package import if anyone runs it standalone later; the backend itself uses the working invocation regardless.

Tested against the synth log's 20s GPS-loss window: smoothed uncertainty at mid-run (~3.5m std_e_m) is roughly half the live filter's stored value at the same timestamp (~6.6m) — consistent with the tightening Palak described. `server/scripts/testSmootherEndpoint.js`.

### Map-matching / road-snapping endpoint
Charvi will render a third path layer that snaps the corrected trajectory to actual OSM road segments. Massive visual credibility win. Backend batches fused points and calls OSRM.

- [x] Buffer the last N `fused_result` points per session (suggest N = last ~5 seconds worth, i.e. ~250 samples at 50 Hz — but subsample to ~1 per 500ms before sending; OSRM doesn't want 50 Hz) — `server/mapMatch.js`, timestamp-windowed buffer (not wall-clock, so it behaves the same for live and replayed sessions)
- [x] Every ~5 seconds, POST the subsampled buffer to **OSRM's map-matching endpoint** — wall-clock `setInterval` for live sessions; replayed sessions dump rows near-instantly so there's a **flush-on-subprocess-exit** instead, or the 5s timer would never fire before the session ends
- [x] Parse the returned matched-path geometry (`matchings[0].geometry.coordinates`) into `[{lat, lon}, ...]`
- [x] Emit a `matched_path` socket.io event to the session with the array
- [x] Handle OSRM failure gracefully (no matches, rate limit) — just skip that batch, don't kill the session. Log at warn level. — tested against a degenerate stationary-point input (the real iOS capture never moves), fails with a warning, doesn't crash
- [x] Cache the last successful `matched_path` in the session so a late-arriving frontend can catch up on reconnect — `matcher.getLastMatchedPath()`, exposed via a `get_matched_path` socket ack

**Found during testing — not just a theoretical rate limit:** the public OSRM demo server hard-caps `/match` requests at **10 trace coordinates** — confirmed empirically, `400 TooBig` above that, every time, not occasional throttling. The suggested 5s-window/500ms-subsample defaults produce up to 11 points, which would silently break map-matching on nearly every dispatch. Fixed by hard-capping to the most recent 10 points (`OSRM_PUBLIC_MAX_COORDS` in `mapMatch.js`) — but this makes each matched-path batch cover a shorter distance than the original ~5s plan intended. Given how tight this cap is:
- [x] Self-hosted OSRM — deployed as its own Railway service (`osrm`) in the same project, reached over Railway's private network (`osrm.railway.internal:5000`) rather than public internet. Raises the coordinate cap to 100 (confirmed empirically: works through 100, fails at 200 — matches `osrm-routed`'s own `--max-matching-size` default). `mapMatch.js` picks the right cap automatically via `OSRM_MAX_COORDS` based on whether `OSRM_URL` is set.
  - Build is reproducible but the ~300MB preprocessed data isn't in git: `osrm/build-extract.sh` downloads Geofabrik's South India extract, clips to a generous Bangalore-metro bounding box (every real GPS capture so far falls well inside it — reasonable bet since all sample data points there, but confirm before the actual venue if the demo moves elsewhere), runs the standard `osrm-extract`/`partition`/`customize` pipeline. `osrm/Dockerfile` bakes the result into the official image.
  - Deployed via `railway up osrm --path-as-root --service osrm --no-gitignore` — the `--no-gitignore` matters: `railway up` respects `.gitignore` by default, and the data directory is (deliberately) gitignored, so the first attempt silently uploaded an empty `data/` and failed with `lstat /data: no such file or directory`
  - Verified with real traffic, not just deploy status: the `osrm` service's own logs show an actual `/match` request landing from Railway's private IP range, returning 200 — confirms the backend is genuinely using the self-hosted instance, not silently falling back to the public one
  - Rebuild note: if the extract ever needs redoing, `osrm/build-extract.sh` documents the exact steps

## Deploy
- [x] Pick a backend host — **Railway**, chosen for Docker support + no idle spin-down (Render's free tier sleeps after ~15 min, which would cause an embarrassing 30-60s cold start if a judge tries the demo after a lull)
- [x] Package the app for deployment — root `Dockerfile` (Node 22 + Python 3 + build tools for `better-sqlite3`'s native compile), `.dockerignore`. `index.js` now reads `PORT`/`CORS_ORIGIN` from env instead of hardcoding, since hosts assign the port dynamically
- [x] Proved the Docker image works, not just that it builds — ran the full test suite (`testLiveIntegration.js`, `smokeTestRealData.js`, `testMapMatchIntegration.js`) against a locally-run container reachable only through its exposed port, same as a real host would run it. All passed, including the outbound call to OSRM from inside the container.
- [x] Deployed to Railway — **not via GitHub connect**: the repo is owned by `pxlkele`'s GitHub account, and Railway's GitHub App can only be authorized by the repo owner, not a collaborator. Used the Railway CLI instead (`railway login` → `railway init` → `railway up`), which uploads local code directly and sidesteps repo-ownership entirely. Live at **https://sih-2026-backend-production.up.railway.app**. Downside: no auto-redeploy on push to `main` yet — `railway up` needs to be re-run manually after changes, or pxlkele connects GitHub later for that
- [x] Re-ran the smoke tests above against the live Railway URL (not just the local container) — all three passed (`testLiveIntegration.js`, `smokeTestRealData.js`, `testMapMatchIntegration.js`), including a real fused_result/matched_path round trip and an outbound OSRM call from Railway's network. Scripts now take `BACKEND_URL` env var so this is repeatable against any deploy
- [ ] Smoke-test against Charvi's Vercel frontend once it exists — set `CORS_ORIGIN` env var (`railway variable set CORS_ORIGIN=<her URL>`) to replace the current wildcard `*`. Now accepts a comma-separated list (see Security below), so localhost can stay allowed alongside her URL for dev testing
- [ ] Test end-to-end in venue-like network conditions
- [ ] *(Optional)* SQLite storage is ephemeral on Railway unless a Volume is mounted — data resets on redeploy. Fine for a hackathon demo; mention to the team if session history needs to survive restarts

## Security
Basic audit done — no SQL injection (parameterized queries throughout `db.js`) or command injection (subprocess calls use array args, never shell strings) risk found. Two gaps fixed:
- [x] `CORS_ORIGIN` now accepts a comma-separated list, not just one string — ready to lock down to Charvi's frontend URL (plus localhost for dev) the moment it exists, without touching code again. Still defaults to `*` since her URL doesn't exist yet — deliberately not locked down yet so as not to break her or my own testing
- [x] Capped concurrent live sessions / `/replay` calls at `MAX_CONCURRENT_SESSIONS` (default 20, override via env var) — each one spawns a real Python subprocess, so with no cap a flood of connections could exhaust server resources. Rejected connections get a `server_busy` event / `503`, never spawn a subprocess. Tested with the cap set to 2: 3rd connection correctly rejected, no orphaned Python process, and a new connection succeeds immediately once a slot frees up
- [x] Rate limiting added (`express-rate-limit`) on all HTTP routes — `RATE_LIMIT_PER_MINUTE` (default 60), generous on purpose since it's meant to stop scripted hammering, not slow down normal clicking around. Deliberately **not** applied to the socket `sample` event — that's the actual live-demo feature streaming continuously at ~50Hz, and guessing a threshold wrong there risks breaking the real demo; `MAX_CONCURRENT_SESSIONS` already bounds that risk (one flooded socket = one subprocess, not many). Tested by setting the limit to 5/min and confirming requests 3+ got a real `429`.
- [x] `GET /sessions`, `GET /sessions/:id`, `GET /sessions/:id/smoothed` now support an **optional** API key gate (`SESSIONS_API_KEY` env var + `x-api-key` header) — **off by default**, current open behavior unchanged, so nothing breaks for Charvi's frontend if it's built against these expecting no auth. Turn it on later (`railway variable set SESSIONS_API_KEY=...`) once the team actually wants session history locked down and everyone knows to send the header. Tested both states: no key set → open as before; key set → 401 with no/wrong header, 200 with the right one.
- [ ] Socket `sample` events have no payload size cap (the CSV `/replay` endpoint already has a 25MB one) — left alone deliberately, see above
- [ ] No security headers (`helmet` or similar) — low priority, cheap to add later
- Also installed `npm audit fix` while adding the rate limiter — picked up a moderate DoS vulnerability in a transitive `qs` dependency, unrelated to but found alongside this work
- **Fixed a real pre-existing bug surfaced by this work, unrelated to security itself:** all four `server/scripts/test*.js` files called `socket.close()` immediately followed by a forced `process.exit()` on the very next line — a race with native handle teardown that reliably crashes with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` on Windows once request-handling picked up a few extra milliseconds of middleware overhead. Fixed by setting `process.exitCode` and letting Node exit naturally instead of forcing it, in all four scripts.
