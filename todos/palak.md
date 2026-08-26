# Palak — To-Do

**Role:** Team lead · ML lead (Kalman filter) · inference API · pitch narrative · **final go/no-go on demo day**

## Kalman filter (model)
- [ ] Implement classical Kalman filter over the locked CSV schema (50 Hz IMU, ~1 Hz GPS, device-frame raw values)
- [ ] Handle frame rotation inside the Kalman step (data arrives as device-frame raw values)
- [ ] Correctly handle GPS gaps as `null` — do **not** forward-fill (see `data_schema.md`)
- [ ] Tune process + measurement noise on the real car-drive log
- [ ] Sanity metric: end-to-end position drift vs. raw-GPS baseline on a GPS-degraded segment
- [ ] Reference IMU datasets (RIDI / RoNIN) if extra tuning data is needed

## Inference-serving API
- [ ] Define request/response schema for a single fusion step (input: IMU+GPS sample or window; output: corrected position + covariance)
- [ ] Streaming endpoint compatible with the WebSocket path Aleena/Charvi are wiring
- [ ] Warm-start / state persistence between samples in the same session

## Pitch narrative + demo ownership
- [ ] Lock the story: problem → why classical Kalman → the "wow" moment (raw-GPS path vs. corrected path on the map)
- [ ] Rehearse pitch to fit judging time slot
- [ ] Own the **live-demo go/no-go call** on demo day
- [ ] Ensure fallback video exists and is queued before we walk in

## Coordination
- [ ] Sign off on the live-ingestion schema with Angad + Aleena (blocker)
- [ ] Sign off on backend hosting choice with Aleena (blocker)
