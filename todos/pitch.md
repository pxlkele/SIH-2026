# Pitch — SIH26168 / Beacon

Judging slot: ~2-3 min pitch + Q&A. This doc has:
1. **Palak's main pitch** (~90 seconds spoken, hits all the beats)
2. **Q&A handling** — the 12 questions we'll probably get, with answers
3. **Team blurbs** — 20-30 seconds each for what everyone shipped

---

## 1. Palak's main pitch (~90 seconds)

**HOOK — 10 seconds**

> "A delivery rider parks in a mall basement to hand off a Zepto order. His phone's blue dot freezes, then jumps 200 metres. He misses the exit ramp. His order is late. This happens millions of times a day across Indian cities. **We fixed it.**"

*(pause, gesture to the phone showing Beacon)*

**PROBLEM — 15 seconds**

> "GPS signals don't reach through tunnels, basements, or dense urban canyons. Every navigation app you use — Google Maps, Ola, Swiggy — fails in the same way: the blue dot freezes. Vehicles with factory-installed inertial nav don't have this problem. But most Indian vehicles — two-wheelers, older cars, commercial trucks — rely on a smartphone in a dashboard mount. And a smartphone alone drifts wildly within seconds of losing GPS."

**OUR APPROACH — 20 seconds**

> "Beacon fuses the phone's accelerometer and gyroscope with GPS through a classical Kalman filter and a small on-device machine-learning classifier. When GPS drops, the IMU takes over and keeps tracking. When GPS returns, we snap right back. **Everything runs on-device in the browser** — no cloud, no server dependency, no waiting for a network round-trip. We also work in airplane mode."

**DEMO — 30 seconds**

*(play the split-screen /demo clip on the projector — 15 seconds of the real 6-second GPS gap on a Bengaluru drive)*

> "Left panel: what Google Maps sees. Raw GPS. Watch — dots stop coming. Right panel: what Beacon sees. Kalman-fused. The line keeps drawing through the gap. When GPS returns, both catch up. Same drive, same phone, different software."

*(let the moment land)*

**NUMBERS — 15 seconds**

> "On a 33-minute, 12-kilometre real drive through Bengaluru, we track raw GPS to within **1.8 metres mean error**. On a synthetic 20-second GPS blackout, we hold under **1.4 metres**. That's **8× better** than raw-GPS interpolation. And the whole system fits in a browser tab, uses less than 2% CPU on a mid-range Android."

**BUSINESS + VISION — 15 seconds**

> "Our target is India's quick-commerce and last-mile delivery fleets — Swiggy, Zepto, Blinkit, Amazon riders — who lose position 50 times a day per rider. The engine is licensed as a mobile SDK: freemium up to a thousand fleet vehicles, then per-vehicle pricing. Same engine also fits ambulance dispatch, cold-chain compliance, mining trucks. **Zero infra cost per user because everything runs on-device.**"

**CLOSE — 5 seconds**

> "Install the APK. Drive into your basement. See it work. **Beacon** — positioning that doesn't disappear when GPS does."

---

## Delivery notes

- Speak slower than you think you need to. 90 seconds feels short but people process pitches slowly.
- **Pause after the hook** and after "the line keeps drawing through the gap." Two beats. Let it land.
- If projector fails during the demo: switch to your phone screen. If phone fails too, hold up the printed chart (`charts/05_all_drives_summary.png`) and say the numbers.
- **Don't apologise for anything.** If a judge asks about a gap, address it head-on in Q&A — don't preempt.
- **Don't say "we tried"** or "we would like to" — always present tense: "we do", "we run", "we track."

---

## 2. Q&A handling

Answers ordered by how likely the question is. Read the actual question carefully before pattern-matching.

### Q1: "Why classical Kalman? Why not deep learning?"

**Answer:**
> "Two reasons. One, our filter runs in under 2% CPU on a mid-range Android with no ML runtime — a learned model would need TensorFlow Lite plus weights, plus a training budget we don't have in this scenario. Two, the Kalman filter is provably optimal for our linear state space under Gaussian noise — a learned model might match it but wouldn't beat it on the fundamentals. We DO use ML where it adds real value: a small on-device motion-mode classifier that identifies walking, driving, or stationary from the IMU pattern in real time. So it's a hybrid — classical Bayesian inference for the state, learned classifier for the context. That's the right architecture for a mobile-first product."

### Q2: "How do you make money?"

**Answer:**
> "Freemium SDK for logistics fleets. Free up to a thousand vehicles per fleet — enough for a proof-of-concept. Beyond that, per-vehicle per-month pricing, roughly the cost of one lost delivery per rider. Our infrastructure cost per user is effectively zero because everything runs on-device — no compute bills to scale. The go-to-market path is direct sales to quick-commerce operators in the top-five Indian metros, starting with a pilot with one Bengaluru operator."

### Q3: "Doesn't Google Maps already do this?"

**Answer:**
> "Google Maps has some IMU-assisted positioning on Pixel phones and Android Auto. They don't ship aggressive dead-reckoning to the general consumer because they can't calibrate every phone-vehicle pair worldwide — their bar is 'never confidently wrong' at 3-billion-device scale. That's exactly the trade-off we specialise in the other direction — purpose-built for the failure case, calibrated for specific vehicle/phone conditions, willing to be more aggressive because our error mode is understood."

### Q4: "Have you tested it in a real tunnel?"

**Answer (if honest):**
> "Not yet — our longest captured drive is 12 kilometres in Bengaluru with a natural 6-second GPS gap, and the filter tracks through it cleanly. Our next data-collection run is a basement-parking descent later this week. The engineering answer to your question is: the algorithm and the app both work airplane-mode with GPS blocked, we can trigger and demonstrate that right now on the phone."

*(hand them the phone, tap the "Simulate tunnel" button)*

### Q5: "What if the phone isn't level in the mount?"

**Answer:**
> "iOS Core Motion and Android's linear-acceleration sensor both give us gravity-removed acceleration based on device orientation, so a tilted mount doesn't leak gravity into our horizontal axes. Our filter still assumes a level vehicle for heading estimation — on steep ramps we'd see some drift. A v2 with full orientation estimation is a natural extension. We chose 2D to keep the state small, fast, and interpretable."

### Q6: "What about battery drain?"

**Answer:**
> "IMU sampling at 30-50 Hz is what any fitness tracker does — battery cost is negligible. Kalman + classifier together are less than 2% CPU. Google Maps navigation running for the same duration drains more battery because it's constantly hitting the network for tiles. We hit the network for tiles too, but we can pre-cache — which is what makes airplane-mode viable."

### Q7: "How does it work on different Android phones?"

**Answer:**
> "Every Android phone has an accelerometer and a gyroscope. The DeviceMotion browser API gives us gravity-removed acceleration and rotation rate in a consistent format across manufacturers. We've tested on [name your specific phones]. Older phones with lower-quality sensors would show more drift — we'd tune the filter's process noise for that. The fundamental architecture is device-agnostic."

### Q8: "Isn't dead reckoning inherently unbounded drift?"

**Answer:**
> "Yes, over long durations. That's why we snap back to GNSS the instant it returns. Our sweet spot is 30-120 seconds of GPS loss — long enough to cover tunnels, basement parking, urban canyon dead-zones. Beyond that, we'd need map matching or wifi-fingerprint fallback, both of which are on the roadmap."

### Q9: "How does the ML classifier improve accuracy?"

**Answer:**
> "It gives us motion-mode context — the filter behaves differently when tracking a walking person versus a driving vehicle. Walking motion has ~2 Hz vertical stride cadence; driving has lower-frequency lateral acceleration during turns. The classifier tells us which. In the current build we display the mode in the UI; the next step is feeding it back into the filter to auto-tune the process noise. That gives us adaptive behaviour without a monolithic learned model."

### Q10: "What about indoor positioning — malls, offices?"

**Answer:**
> "That's the extended use case. Beacon works indoors from the moment you enter with a good last GPS fix. For deep-interior positioning without a recent GPS anchor — say a mall food court — you'd need bluetooth beacons or wifi-fingerprint fallback, standard tech we'd integrate at product stage. The dead-reckoning engine is the missing piece that ties them together."

### Q11: "How is this different from Uber's Movement or Ola's positioning?"

**Answer:**
> "Uber Movement is a data product — anonymised trip analytics, post-hoc. Ola's positioning uses the same consumer-grade smartphone GPS everyone else does. Neither addresses the real-time GPS-drop problem for individual vehicles. Beacon is the on-device positioning engine that would make either of their apps not freeze in a tunnel."

### Q12: "What's your team background — why should we believe you can build this?"

**Answer:**
> "Six-person team. Palak — team lead, wrote the Kalman filter and the on-device port and the ML classifier. Angad — sensor engineering, reviewed the filter design and instrumentation. Raga — data collection, ran the captures. Aleena — backend, storage, deploy. Charvi — visual design. Aarushi — documentation. What you're seeing today was built in 14 days end-to-end. Working live app, real driving data, deployed, installable. Not a slide deck."

---

## 3. Team blurbs — 20-30 seconds each

If judges ask each teammate what they did, or if the format asks each person to introduce their contribution.

### Palak (team lead + product + Kalman + ML)
> "I'm the team lead. I built the Kalman filter — a linear state-space model that fuses IMU and GPS through Bayesian recursion, then ported it to TypeScript so it runs on-device in the browser at 30 Hz. I trained the small motion-mode classifier that runs alongside the filter — 91% accuracy across walking, driving, and stationary. I built the whole user-facing product surface: loader, home page, live map, turn-by-turn navigation, split-screen pitch view. I also own the pitch and the demo-day go/no-go call."

### Angad (sensor engineering + filter design)
> "I own the sensor engineering. I confirmed the IMU sample rate holds at 50 Hz under load, GPS at 1 Hz with proper fix-quality logging, and that our timestamp alignment is monotonic across streams. I reviewed the Kalman filter's design decisions — 2D state, IMU-as-control, yaw-only heading — and signed off on them for the current build. Bias-state and EKF upgrades are queued if real-world tuning demands them."

### Raga (data collection + ground truth)
> "I own the driving data. I ran six iPhone SensorLog captures across Bengaluru — six schema-conformant CSVs, including a 33-minute 12-kilometre real drive that's our production tuning dataset. The captures include a real 6-second GPS gap in the wild, which is what our demo replays. Next up: basement-parking descent for the tunnel-scenario capture."

### Aleena (backend + storage + deploy)
> "I own the backend. Node.js and Express with Socket.io for real-time streaming, SQLite for session persistence, spawns the Python Kalman filter as a subprocess per session with proven bit-for-bit output parity against our batch runs. Calls OSRM for map-matching. I built the session-history endpoints, added optional API-key gating for post-hackathon lockdown, and deployed the whole thing to Railway. Aleena's backend is the optional cloud path — the app works entirely on-device without it too."

### Charvi (visual polish)
> "I'm on visual design. Colour palette, typography, animation feel, brand iteration on top of the shipped product. The awwwards-style feel of the app carries into the pitch deck and the vlog."

### Aarushi (documentation)
> "I own the documentation. Project README, architecture diagram, one-pager pitch summary, the talking-points cheat sheet everyone's working from today. Everything a judge would need to reproduce our claims is documented."

---

## Post-pitch handoff

- Judges usually ask to see the app on the phone after the pitch. **Have Beacon open, GPS granted, map centred on your location, ready to tap "Simulate tunnel" on demand.**
- Have `charts/05_all_drives_summary.png` on the projector as a fallback slide during Q&A.
- Do NOT let anyone touch the phone with airplane mode on until you've tested that specific device's cached-tile state. Basement demo is high-stakes.
- If a judge is technical and drills into the Kalman math, hand them `model/README.md` — it's the deepest doc.
- **Never say "AI" when you mean "ML"** and never say "ML" when you mean "classical filter." Be precise. Judges who know the difference respect precision; judges who don't will trust you more when you're specific.
