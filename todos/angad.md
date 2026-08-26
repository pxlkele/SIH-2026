# Angad — To-Do

**Role:** Sensor engineering — IMU/GPS instrumentation + hardware-side fusion

## Instrumentation
- [ ] Confirm IMU sample rate holds steady at 50 Hz under load
- [ ] Confirm GPS delivers ~1 Hz with fix quality logged (accuracy/HDOP or equivalent)
- [ ] Timestamp alignment between IMU and GPS streams — single monotonic clock source
- [ ] Verify raw device-frame output matches the locked `data_schema.md` field-for-field

## Hardware-side fusion / live path
- [ ] Wire sensor output to the live-ingestion transport (WebSocket) chosen with Aleena
- [ ] Handshake / reconnect behavior for the demo (wifi at the venue is unreliable)
- [ ] GPS-loss simulation trigger for the demo scenario (physical or software)

## Venue-readiness
- [ ] Sensor rig runs off battery for the length of the demo slot + rehearsal
- [ ] Spare cables / dongles / mount / backup device
- [ ] Test full sensor → backend → frontend loop in venue-like network conditions (not just dev machine)

## Coordination
- [ ] Agree on live-ingestion schema with Palak + Aleena (blocker)
