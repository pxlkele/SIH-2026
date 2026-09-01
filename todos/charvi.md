# Charvi — To-Do

**Role:** Frontend — React + shadcn/ui + Tailwind, deployed to Vercel
## To make a dynamic interactive frontend 

## Core UI
- [ ] App scaffold: React + shadcn/ui + Tailwind
- [ ] Map view: Mapbox GL JS *or* Leaflet + OpenStreetMap
- [ ] Two overlaid paths on the map: **raw GPS** vs. **Kalman-corrected** (this is the "wow moment" — make the contrast unmissable)
- [ ] GPS-degraded scenario trigger visible in the UI
- [ ] Clear "dead reckoning active" state indicator when GPS drops

## Live data flow (primary path)
- [ ] WebSocket / Socket.io client that consumes Aleena's stream (event: `fused_result` — same event for live and replay paths)
- [ ] Render fused position updates in real time without jank
- [ ] Keep component structure **decoupled** so replayed log data can swap in as fallback with minimal changes

## Tier 1 winner-tier features (Palak scoped, do these after core UI works)

These are the four adds that separate "working Kalman demo" from "obviously the winning project." Do them in this order — each one stands alone but they compound.

### 1. Road-snapped corrected path (map-matching)
The corrected line follows real OSM road segments instead of floating in space. Massive visual credibility win.

- [ ] Consume the new `matched_path` event from Aleena's backend (see her todo) — array of `{lat, lon}` already snapped to roads
- [ ] Render as a third map layer beneath raw + corrected — thicker line, distinct color (e.g. bright green vs. corrected's blue)
- [ ] Update layer whenever a new batch arrives (Aleena's backend batches every ~5s and emits)
- [ ] Toggle in a legend to show/hide it (useful for the pitch to explain the layering)

### 2. Confidence ellipse around the vehicle marker
Rendered ellipse that visually grows during GPS loss and shrinks when GPS returns. Proof the model knows what it doesn't know — judges love this.

- [ ] MVP: axis-aligned ellipse from `std_e_m` and `std_n_m` already in `fused_result` — semi-major = 2·std_e_m (East), semi-minor = 2·std_n_m (North), no rotation
- [ ] Render as a translucent circle/ellipse layer on the map, re-drawn each `fused_result` frame
- [ ] Fade color from green (low uncertainty, <5m) → yellow → red (>30m). Do NOT clip — a giant red ellipse during outage IS the story.
- [ ] **Upgrade path:** `fused_result` now also includes `cov_ee`, `cov_en`, `cov_nn` (full 2×2 position covariance in m²). Eigendecompose for a properly rotated ellipse — sample JS snippet is in `model/README.md :: Inference API`. Do this after the axis-aligned MVP works.

### 3. Live "Dead Reckoning ON / OFF" toggle
One button on the demo view. Pauses rendering the corrected path/marker and shows only what raw GPS would look like *right now, on this trip*. Makes the value proposition undeniable in one click.

- [ ] Button in a fixed HUD corner: "🛰 Dead reckoning: ON | OFF"
- [ ] When OFF: hide the corrected path layer + confidence ellipse; show only raw GPS points + a straight-line interpolation between them (this is what Google Maps does — flat gray blob in tunnels)
- [ ] Frame the moment: while toggled OFF *during* a GPS-loss segment, the vehicle marker literally freezes on the map. Judges will get it immediately.
- [ ] This is pure client-side — no backend change needed. Both layers already come in via `fused_result`.

### 3b. Split-screen "raw GPS vs Kalman" view (extends #3, higher wow)
Take the toggle further — put both worlds on screen at the same time. Left panel: raw-GPS-only. Right panel: our fused output. Same session, same time, synchronised playback.

The instant judges see the left marker freeze in a tunnel while the right marker keeps moving smoothly — the pitch is over. They already understand.

- [ ] Two map instances side by side, same style, same zoom, same current bounds
- [ ] Both driven by the SAME event stream — no duplicate socket connections needed
- [ ] Left map: only ever consume `gps_used: true` samples. Draw raw GPS points + straight-line interp between them. Marker position = last raw GPS lat/lon. Between fixes, marker *does not move* (this is the point).
- [ ] Right map: consume every `fused_result`. Draw the corrected path, marker follows `lat/lon`, ellipse per frame.
- [ ] Camera sync: when the user pans/zooms either map, the other follows. Mapbox has a helper — `map.on('move', () => otherMap.jumpTo(map.getCenter()))`. Watch for infinite loops; use a `syncingFlag`.
- [ ] Bottom-corner labels: "Raw GPS (what Google Maps sees)" left, "Kalman-fused (our system)" right.
- [ ] Big centre pill during a GPS-loss segment: **"GPS LOST — dead reckoning active"** with a countdown timer of how long the outage has run.
- [ ] Under the split, a Google-Maps-style speed/course row updating from `fused_result.heading_rad` + derived speed (or the `matched_path` if you want ground-snapped).

This is the demo shot Aarushi wants for the pitch deck. **Design for a screenshot** — it should read as a compelling single frame even without motion.

### 3c. RTS-smoothed playback layer (post-run mode)
The backend now supports a "post-run smoother" — an RTS pass over a completed session that produces a significantly better trajectory than the live filter (see `model/README.md`: **5× tighter through the synth outage — 1.39 m vs 6.35 m mean drift**).

- [ ] When a session ends, request the smoothed trajectory from Aleena's `/session/:id/smoothed` endpoint (she'll need to add this — it just calls `model/smoother.py` on the persisted samples)
- [ ] Render as a THIRD path layer on the map (thick, distinct color — suggest deep purple or gold): "post-run refined trajectory"
- [ ] Toggle to show/hide alongside live / raw
- [ ] Pitch framing: *"live is what we compute in the moment; smoothed is what we compute after — same math, one pass forward, one pass back."*

### 4. Live drift counter HUD
Numbers on-screen that turn abstract accuracy into a scoreboard.

- [ ] Fixed corner overlay with three live-updating figures:
  - **Current uncertainty:** `sqrt(std_e_m² + std_n_m²)` from latest `fused_result`, in metres, 1 decimal
  - **GPS lost for:** MM:SS since last `fused_result` with `gps_used: true`. Reset to `00:00` on next GPS-consumed frame.
  - **Deviation from raw GPS:** distance between latest corrected position and latest raw GPS point (haversine or planar approx). Grows during outage.
- [ ] Recharts sparkline underneath each number — 30-second rolling window
- [ ] Framer Motion fade/slide when values cross thresholds (e.g. flash red when uncertainty > 20m)

## Optional polish (only if core is solid)
- [ ] Framer Motion path-drawing animation for the payoff moment on run replay

## Deploy + demo
- [ ] Deploy to Vercel
- [ ] Test end-to-end against real backend in venue-like network conditions
- [ ] Sanity-check the demo flow matches the locked demo script

## Websites to check out for inspiration
https://www.awwwards.com/inspiration/home-page-carousel-field-day-sound
https://www.awwwards.com/awwwards/collections/image-gallery-and-slideshows/
https://dribbble.com/search/carousel
https://www.vev.design/blog/web-carousel-design/


