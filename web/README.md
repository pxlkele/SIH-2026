# SIH26168 · Frontend (`web/`)

React app for the Intelligent Dead Reckoning project. Consumes Aleena's
Socket.io backend, renders live GPS + Kalman-fused paths on a Mapbox GL
map, plus turn-by-turn navigation.

**Ownership split (2026-09-03):**
- **`/app` and `/demo`** — Palak. Interactive product + pitch showcase.
- **`/` (marketing/landing)** — Charvi. Currently a redirect to `/app` as a placeholder until her landing lands.

## Stack
- **Vite + React + TypeScript** (fast HMR, one-command deploys to Vercel)
- **Mapbox GL JS** for the map layers (imperative updates, no React re-render on 30-50 Hz socket events)
- **socket.io-client** for backend transport
- **Tailwind + shadcn/ui** for UI

## Setup

```bash
cd web
npm install
cp .env.example .env.local
# open .env.local and add your VITE_MAPBOX_TOKEN
npm run dev
```

If `VITE_BACKEND_URL` is unset (default), the app runs against a **built-in mock stream** — synthetic 60s scenario with a 20s GPS-loss window, generated live in the browser. Perfect for UI dev without needing Aleena's server running.

To point at a real backend:
```
VITE_BACKEND_URL=http://localhost:3000
```

## Routes
- **`/`** — redirects to `/app` for now. Reserved for Charvi's landing.
- **`/app`** — the product view. Single fused path, follow-vehicle camera, confidence ellipse, DR-active badge, **turn-by-turn navigation** (Mapbox Directions).
- **`/demo`** — the pitch showcase. Split-screen raw-GPS vs Kalman-fused, synchronised cameras, GPS-lost centre pill, drift-counter HUD. Uses real drive data from `data/real/output/sep02a/*.csv`.

## Layout

```
web/
├── public/
│   ├── data/                # drive_corrected.csv + drive_raw_gps.csv
│   │                        # (real 3.2 km drive, replayed in /demo)
│   └── favicon.svg
├── src/
│   ├── App.tsx              # router
│   ├── main.tsx             # entry
│   ├── index.css            # tailwind + mapbox css
│   ├── pages/
│   │   ├── MainApp.tsx      # /app  — product view + turn-by-turn
│   │   └── DemoView.tsx     # /demo — pitch showcase (split-screen)
│   ├── map/
│   │   └── MapView.tsx      # Mapbox GL wrapper — imperative API, no re-render on socket events
│   ├── nav/
│   │   ├── mapboxApi.ts     # Mapbox Geocoding + Directions wrappers
│   │   ├── useNavigation.ts # route state + step-advance hook
│   │   ├── NavSearch.tsx    # destination search input
│   │   └── NavDirectionsPanel.tsx  # turn-by-turn overlay
│   ├── data/
│   │   ├── types.ts         # FusedResult + MatchedPathPoint wire types
│   │   ├── useFusionStream.ts   # socket.io client hook (with mock fallback)
│   │   └── driveReplay.ts   # loads /data/*.csv and replays with fake outage
│   └── components/
│       ├── Logo.tsx         # Beacon wordmark + radar mark
│       └── ui.tsx           # Button, LinkButton, Panel, Pill, Eyebrow
├── tailwind.config.js
├── .env.example
└── package.json
```

## Backend contract
Documented in `../model/README.md :: Inference API`. Two events matter:
- `fused_result` — every sample. See `src/data/types.ts :: FusedResult`.
- `matched_path` — batched (~every 5s), road-snapped geometry from OSRM.

## Landing (`/`) is Charvi's lane
Currently `/` redirects to `/app` as a placeholder. Charvi replaces that
with the marketing landing site — either in this repo (`src/pages/Landing.tsx`
+ update `App.tsx` routing) or as a separate Vercel deploy that links to
this app's `/app` and `/demo` URLs. See `../todos/charvi.md`.
