# Charvi — To-Do

**Role:** Frontend — React + shadcn/ui + Tailwind, deployed to Vercel
## To make a dynamic interactive frontend

## Two modes — keep them separate

The frontend has **two distinct views**. Don't merge them. The judges' "wow" belongs in one place; the product story belongs in the other.

- **Main app** (`/` — what a real user would see): a clean nav-style single map. Just works. No pitch instrumentation, no explanatory toggles.
- **"See Demo"** (`/demo` — accessed via a button on the landing page): the pitch showcase. Split-screen, DR ON/OFF toggle, drift counter, everything comparative and educational. This is what runs on the projector during judging.

---

## Main app (`/`)
The product view. Assume the user just wants nav that works.

- [ ] App scaffold: React + shadcn/ui + Tailwind
- [ ] Map view: Mapbox GL JS *or* Leaflet + OpenStreetMap
- [ ] Single fused path line (Kalman-corrected) — the honest, always-on product output
- [ ] Vehicle marker rotating by `heading_rad`
- [ ] Confidence ellipse around the marker — kept here because uncertainty visualisation is a *real product feature* (like Google Maps' accuracy circle, but better). Users benefit from knowing when the app is guessing.
  - MVP: axis-aligned from `std_e_m` / `std_n_m` in `fused_result`
  - Upgrade: rotated via `cov_ee`/`cov_en`/`cov_nn` — eigendecomp snippet in `model/README.md :: Inference API`
- [ ] Subtle "dead reckoning active" indicator when GPS is lost (a small badge, not a splash). Users want to know when to trust the nav less.
- [ ] Follow-the-vehicle camera behaviour (recenter on each `fused_result`)

## "See Demo" view (`/demo`)
The judge/investor showcase. Design each element for a screenshot. Nothing here needs to look like a shipping product.

### Data flow
- [ ] Consumes the SAME `fused_result` + `matched_path` events from Aleena's backend
- [ ] Ideally hits the CSV-replay path (`POST /replay/:socketId`) with `data/real/ios_drive_2026-08-29.csv` so the demo is deterministic — same story every time judges walk by

### Split-screen "raw GPS vs Kalman"
The core pitch shot. Left panel: raw-GPS-only. Right panel: our fused output. Same session, same time, synchronised.

- [ ] Two map instances side by side, same style, same zoom, same current bounds
- [ ] Both driven by the SAME event stream — one socket connection, two consumers
- [ ] Left map: only ever consume `gps_used: true` samples. Draw raw GPS points + straight-line interp between them. Marker position = last raw GPS lat/lon. Between fixes, marker *does not move* (this is the point).
- [ ] Right map: consume every `fused_result`. Draw the corrected path, marker follows `lat/lon`, ellipse per frame.
- [ ] Camera sync: pan/zoom on one map moves the other. Mapbox: `map.on('move', () => otherMap.jumpTo(map.getCenter()))`. Watch for infinite loops — use a `syncingFlag`.
- [ ] Bottom-corner labels: "Raw GPS (what Google Maps sees)" left, "Kalman-fused (our system)" right.
- [ ] Big centre pill during a GPS-loss segment: **"GPS LOST — dead reckoning active"** + running MM:SS counter.
- [ ] Under the split, a Google-Maps-style speed + course row updating from `fused_result.heading_rad` + derived speed.

**Design for a screenshot** — the frame should tell the whole story even without motion. Aarushi will use it for the pitch deck.

### Live "Dead Reckoning ON / OFF" toggle (in the split view or as its own single-map subview)
- [ ] Button in a fixed HUD corner: "🛰 Dead reckoning: ON | OFF"
- [ ] OFF: hide the corrected path + ellipse, show only raw GPS + straight-line interp (what Google Maps effectively does in tunnels)
- [ ] Frame the moment: while toggled OFF *during* a GPS-loss segment, the vehicle marker literally freezes on the map. Judges get it in one second.

### Road-snapped path layer (map-matching)
- [ ] Consume `matched_path` event from Aleena's backend — array of `{lat, lon}` already snapped to OSM roads
- [ ] Render as an additional layer on the right panel (Kalman side) — thicker, distinct colour (bright green)
- [ ] Toggle in a legend to show/hide (useful when explaining the layering to judges)

### Live drift counter HUD
- [ ] Fixed corner overlay with three live-updating figures:
  - **Current uncertainty:** `sqrt(std_e_m² + std_n_m²)`, metres, 1 decimal
  - **GPS lost for:** MM:SS since the last `fused_result` with `gps_used: true`
  - **Deviation from raw GPS:** distance between latest corrected position and latest raw GPS point (haversine or planar approx)
- [ ] Recharts sparkline under each — 30-second rolling window
- [ ] Framer Motion fade/slide when values cross thresholds (flash red when uncertainty > 20 m)

### RTS-smoothed playback layer (post-run showcase)
The backend has a post-run smoother — RTS backward pass over a completed session. **5× tighter than the live filter through the synth outage (1.39 m vs 6.35 m mean).**

- [ ] When a session ends, request the smoothed trajectory from Aleena's `GET /session/:id/smoothed` endpoint (she'll add it — spec is in her todo)
- [ ] Render as a THIRD path layer (thick, deep purple or gold): "post-run refined trajectory"
- [ ] Toggle to show/hide alongside live / raw
- [ ] Pitch framing: *"live is what we compute in the moment; smoothed is what we compute after — same math, one pass forward, one pass back."*

---

## Optional polish (only if the two modes are solid)
- [ ] Framer Motion path-drawing animation for the payoff moment on run replay

## Deploy + demo
- [ ] Deploy to Vercel
- [ ] Test end-to-end against real backend in venue-like network conditions
- [ ] Sanity-check the demo flow matches the locked demo script (specifically the split-screen moment)

## Websites to check out for inspiration
https://www.awwwards.com/inspiration/home-page-carousel-field-day-sound
https://www.awwwards.com/awwwards/collections/image-gallery-and-slideshows/
https://dribbble.com/search/carousel
https://www.vev.design/blog/web-carousel-design/
