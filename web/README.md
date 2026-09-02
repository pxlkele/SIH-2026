# SIH26168 · Frontend (`web/`)

React app for the Intelligent Dead Reckoning demo. Consumes Aleena's
Socket.io backend, renders live GPS + Kalman-fused paths on a Mapbox GL
map. Co-owned by Palak (infrastructure + Tier 1 wiring) and Charvi
(design + polish).

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
- **`/`** — landing page, two CTAs
- **`/app`** — the product view. Single fused path, marker, confidence ellipse, DR-active badge.
- **`/demo`** — the pitch showcase. Split-screen raw-GPS vs Kalman-fused, synchronised cameras, GPS-lost centre pill, drift-counter HUD.

## Layout

```
web/
├── src/
│   ├── App.tsx              # router
│   ├── main.tsx             # entry
│   ├── index.css            # tailwind + mapbox css
│   ├── pages/
│   │   ├── Landing.tsx      # /
│   │   ├── MainApp.tsx      # /app  — product view
│   │   └── DemoView.tsx     # /demo — pitch showcase
│   ├── map/
│   │   └── MapView.tsx      # Mapbox GL wrapper. imperative API, no re-render.
│   └── data/
│       ├── types.ts         # FusedResult + MatchedPathPoint wire types
│       ├── useFusionStream.ts   # socket.io client hook
│       └── mockStream.ts    # local mock (built-in dev mode)
├── tailwind.config.js
├── .env.example
└── package.json
```

## Backend contract
Documented in `../model/README.md :: Inference API`. Two events matter:
- `fused_result` — every sample. See `src/data/types.ts :: FusedResult`.
- `matched_path` — batched (~every 5s), road-snapped geometry from OSRM.

## Design + polish is Charvi's lane
The infrastructure this file describes is functional-but-plain. Colors, typography, animations, landing-page treatment, dark mode, deploy polish — all Charvi. See `../todos/charvi.md`.
