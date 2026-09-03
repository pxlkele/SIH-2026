import { Play, Radio, Wifi } from "lucide-react";
import type { SourceMode } from "./useFusionStream";

interface Props {
  mode: SourceMode;
  onChange: (mode: SourceMode) => void;
  backendConfigured: boolean;
}

const OPTIONS: { key: SourceMode; label: string; icon: any; hint: string }[] = [
  { key: "live",    label: "Live",    icon: Radio, hint: "Phone IMU + GPS, on-device Kalman" },
  { key: "replay",  label: "Replay",  icon: Play,  hint: "Pre-recorded 3.2 km drive" },
  { key: "backend", label: "Cloud",   icon: Wifi,  hint: "Aleena's backend (needs VITE_BACKEND_URL)" },
];

/**
 * Segmented control that flips the app's data source between live sensors,
 * pre-recorded replay, and Aleena's server-side backend.
 */
export function SourcePicker({ mode, onChange, backendConfigured }: Props) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-700 bg-ink-900/85 p-0.5 backdrop-blur">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const disabled = o.key === "backend" && !backendConfigured;
        const isActive = mode === o.key;
        return (
          <button
            key={o.key}
            onClick={() => !disabled && onChange(o.key)}
            title={disabled ? "No backend URL configured" : o.hint}
            disabled={disabled}
            className={
              "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition " +
              (isActive
                ? "bg-accent text-white"
                : "text-ink-300 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40 disabled:pointer-events-none")
            }
          >
            <Icon size={12} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
