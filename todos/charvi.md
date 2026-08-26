# Charvi — To-Do

**Role:** Frontend — React + shadcn/ui + Tailwind, deployed to Vercel

## Core UI
- [ ] App scaffold: React + shadcn/ui + Tailwind
- [ ] Map view: Mapbox GL JS *or* Leaflet + OpenStreetMap
- [ ] Two overlaid paths on the map: **raw GPS** vs. **Kalman-corrected** (this is the "wow moment" — make the contrast unmissable)
- [ ] GPS-degraded scenario trigger visible in the UI
- [ ] Clear "dead reckoning active" state indicator when GPS drops

## Live data flow (primary path)
- [ ] WebSocket / Socket.io client that consumes Aleena's stream
- [ ] Render fused position updates in real time without jank
- [ ] Keep component structure **decoupled** so replayed log data can swap in as fallback with minimal changes

## Optional polish (only if core is solid)
- [ ] Recharts live error-margin / uncertainty graphs
- [ ] Framer Motion path-drawing animation for the payoff moment

## Deploy + demo
- [ ] Deploy to Vercel
- [ ] Test end-to-end against real backend in venue-like network conditions
- [ ] Sanity-check the demo flow matches the locked demo script

## Websites to check out for inspiration
https://www.awwwards.com/inspiration/home-page-carousel-field-day-sound
https://www.awwwards.com/awwwards/collections/image-gallery-and-slideshows/
https://dribbble.com/search/carousel
https://www.vev.design/blog/web-carousel-design/