import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Clock,
  History,
  LogIn,
  LogOut,
  MapPin,
  Navigation,
  Play,
  Ruler,
  User,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { Wordmark } from "../components/Logo";
import { RouteMapPreview } from "../components/RouteMapPreview";

/**
 * Home page — landing at `/` after the loader fades out.
 *
 *   Top-left      : settings / profile button (login / previous drives / logout)
 *   Center        : big "Navigate" CTA → /app
 *   Below CTA     : most recent drive summary card (single)
 *   Bottom-right  : Replay demo → /demo
 */
export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-ink-950 text-ink-100">
      {/* Ambient gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(59,130,246,0.14) 0%, rgba(0,0,0,0) 55%)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-dot-grid opacity-40" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between p-4 sm:p-6">
        <button
          onClick={() => setSettingsOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink-700 bg-ink-900/80 text-ink-100 backdrop-blur transition hover:border-ink-500 hover:bg-ink-800"
          aria-label="Open settings"
        >
          <User size={16} />
        </button>
        <div className="hidden sm:block">
          <Wordmark />
        </div>
        <div className="h-10 w-10" aria-hidden />
      </header>

      {/* Center — Navigate CTA + recent drive */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md space-y-6 text-center"
        >
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-bright">
              Beacon · SIH26168
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready when you are.
            </h1>
            <p className="text-sm text-ink-400">
              On-device dead reckoning · works in tunnels, basements, urban canyons
            </p>
          </div>

          <Link
            to="/app"
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-4 text-base font-semibold text-white shadow-raised transition hover:bg-accent-bright active:translate-y-px"
          >
            <Navigation size={18} className="transition group-hover:-rotate-12" />
            Navigate
            <ChevronRight size={18} className="transition group-hover:translate-x-1" />
          </Link>

          <RecentDriveCard />
        </motion.div>
      </main>

      {/* Bottom-right — Replay */}
      <div className="relative z-10 flex items-center justify-end p-4 sm:p-6">
        <Link
          to="/demo"
          className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/80 px-4 py-2 text-xs font-medium text-ink-200 backdrop-blur transition hover:border-accent-line hover:bg-accent-soft hover:text-accent-bright"
        >
          <Play size={12} />
          Replay demo
        </Link>
      </div>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/* ------------------------- Recent drive card ------------------------- */

function RecentDriveCard() {
  // Hardcoded to the most recent real drive (2026-09-02a). When we wire real
  // storage (via Aleena's SQLite session endpoints), this becomes dynamic.
  const drive = {
    label: "Most recent drive",
    date: "Sep 2 · 10:35 AM",
    area: "North Bengaluru",
    distanceKm: 3.2,
    durationMin: 7,
    driftM: 2.3,
  };
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/70 p-4 text-left shadow-panel backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          <History size={12} />
          {drive.label}
        </div>
        <div className="text-[11px] text-ink-500">{drive.date}</div>
      </div>
      <div className="flex items-center gap-2 text-sm text-ink-100">
        <MapPin size={14} className="text-accent-bright" />
        <span className="font-medium">{drive.area}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono">
        <Stat icon={<Ruler size={12} />} label="Distance" value={`${drive.distanceKm} km`} />
        <Stat icon={<Clock size={12} />} label="Duration" value={`${drive.durationMin} min`} />
        <Stat icon={<Navigation size={12} />} label="Mean drift" value={`${drive.driftM} m`} />
      </div>

      {/* Strava-style static route preview — real drive geometry from
          public/data/drive_corrected.csv, encoded as a polyline overlay
          on Mapbox Static Images API. */}
      <div className="mt-3">
        <RouteMapPreview csvUrl="/data/drive_corrected.csv" />
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-950/40 p-2.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-ink-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 tabular-nums text-sm font-semibold text-ink-100">{value}</div>
    </div>
  );
}

/* -------------------------- Settings sheet -------------------------- */

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const items: { icon: React.ReactNode; label: string; hint: string; disabled?: boolean }[] = [
    { icon: <LogIn size={16} />,  label: "Log in / Sign up", hint: "Sync drives across devices", disabled: true },
    { icon: <History size={16} />, label: "Previous drives",  hint: "Your driving history",         disabled: true },
    { icon: <LogOut size={16} />,  label: "Log out",          hint: "You're not signed in",         disabled: true },
  ];
  return (
    <div className="fixed inset-0 z-30 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.aside
        onClick={(e) => e.stopPropagation()}
        initial={{ x: -320, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -320, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative z-10 flex h-full w-80 max-w-[85vw] flex-col border-r border-ink-800 bg-ink-950 shadow-raised"
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-ink-200">
              <User size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-100">Guest</div>
              <div className="text-xs text-ink-500">Not signed in</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="flex-1 divide-y divide-ink-800/60">
          {items.map((it) => (
            <li key={it.label}>
              <button
                disabled={it.disabled}
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-ink-900/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="mt-0.5 text-accent-bright">{it.icon}</span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink-100">{it.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{it.hint}</span>
                </span>
                <ChevronRight size={14} className="mt-1 text-ink-600" />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-ink-800 p-4 text-xs text-ink-500">
          Auth + drive history land after the hackathon. Everything runs
          locally on-device for now.
        </div>
      </motion.aside>
    </div>
  );
}
