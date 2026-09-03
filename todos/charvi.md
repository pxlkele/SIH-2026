# Charvi — To-Do

**Role:** Frontend — **visual polish + brand iteration** on Palak's shipped product surface

> **Scope revised again (2026-09-04):** Palak built the whole interactive
> product — Loader, Home, /app, /demo — and deployed it at
> **https://beacon-sih.vercel.app**. The Home page already covers most of
> what "marketing landing" would have done (Navigate CTA, recent drive
> preview, replay link, settings).
>
> Your remaining lane: any visual polish / animation / brand iteration you
> want to layer on top. Not ship-blocking.

## The landing site (`/`)

Currently `/` redirects to `/app` as a placeholder. Your job is to replace that with a proper marketing / landing site that lives at `/` and links out to `/app` (open the app) and `/demo` (see the pitch showcase).

### What the landing needs to do
- **Sell the pitch in 5 seconds** — the tagline, the problem, the one number
- **Show credibility** — real numbers from the model (see below), a mention of the SIH problem code
- **Two clear CTAs** — "See Demo" (goes to `/demo`) and "Open App" (goes to `/app`)
- **Optional deeper sections** — how it works, use cases (delivery/emergency/logistics), team

### Real numbers you can drop into the copy
Straight from the model on real drive data (2026-09-02 North Bengaluru captures):

- **2.3 m** mean drift vs raw GPS on a 3.2 km real drive
- **1.7 m** mean drift with the post-run RTS smoother
- **~1.4 m** through a 20-second GPS-loss window (synth, smoothed)
- **8×** better than raw-GPS-interp baseline through outages
- Path length within **1%** of raw GPS on multi-km drives

### Where to build
Two options:

- **Same repo (recommended):** replace/rewrite `web/src/pages/Landing.tsx` and update `App.tsx` to route `/` → your Landing instead of redirecting to `/app`. You get the shared components, Tailwind config, and can preview alongside `/app` and `/demo`.
- **Separate repo/deploy:** if you want total control (e.g. a Next.js marketing site on `beacon-sih.vercel.app`), that works too. Just make sure the CTAs deep-link to the app's `/app` and `/demo` URLs.

### Design brief
Restrained, technical, evidence-heavy. Palak's app is styled Linear/Vercel/Warp-adjacent (Inter font, dark ink palette, single blue accent, tabular numerals for data, subtle grid backgrounds). The landing should match or intentionally set the aesthetic for the whole surface.

Awwwards references (from your earlier notes):
- https://www.awwwards.com/inspiration/home-page-carousel-field-day-sound
- https://www.awwwards.com/awwwards/collections/image-gallery-and-slideshows/
- https://dribbble.com/search/carousel
- https://www.vev.design/blog/web-carousel-design/

---

## Optional: visual polish pass on the app (`/app` + `/demo`)
If you finish the landing with time to spare:

- [ ] Color-system audit — are the path layer colors (raw red / live blue / smoothed purple / snapped emerald / route amber) balanced?
- [ ] Typography audit — HUD numbers, layer labels, "GPS LOST" pill, directions panel
- [ ] Framer Motion micro-interactions — path draw on replay, ellipse breathing under high uncertainty, marker rotation smoothing, HUD counter transitions
- [ ] Landing → app transition (hero moment when the user first hits `/demo`)
- [ ] Dark-mode polish for projector conditions

## Deploy
- [ ] Deploy `web/` to Vercel — either the whole repo (with your landing as `/`) or a separate marketing deploy that links to the app deploy
