# Aleena — To-Do

**Role:** Backend — data ingestion + storage layer (Node/Express)

## Ingestion
- [ ] Define + agree the **live-ingestion schema** with Angad + Palak (blocker for whole team)
- [ ] WebSocket / Socket.io endpoint that accepts the live sensor stream
- [ ] Endpoint that accepts a replayed CSV log conforming to `data_schema.md` (fallback path for Charvi's UI)
- [ ] Validate incoming samples; reject malformed rows without killing the stream

## Storage
- [ ] Persist raw samples + fused output per session (enough to reconstruct a run for debugging / video re-record)
- [ ] Session ID model so frontend can replay a specific run

## Model integration
- [ ] Wire ingested samples into Palak's Kalman inference endpoint
- [ ] Broadcast fused output back over WebSocket to the frontend

## Deploy
- [ ] Pick a backend host (open item) — factor in WebSocket support and cold-start latency for the live demo
- [ ] Deploy backend + smoke-test against Charvi's Vercel frontend
- [ ] Test end-to-end in venue-like network conditions
