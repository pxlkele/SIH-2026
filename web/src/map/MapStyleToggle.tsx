import { Layers, Moon, Satellite } from "lucide-react";
import { useState } from "react";
import type { MapStyle } from "./MapView";

interface Props {
  onChange: (style: MapStyle) => void;
  initial?: MapStyle;
}

const OPTIONS: { key: MapStyle; label: string; icon: any }[] = [
  { key: "dark",      label: "Dark",      icon: Moon },
  { key: "streets",   label: "Streets",   icon: Layers },
  { key: "satellite", label: "Satellite", icon: Satellite },
];

/**
 * Segmented control that lets the user flip the Mapbox base style at
 * runtime. Purely presentational — the parent owns the setStyle() call.
 */
export function MapStyleToggle({ onChange, initial = "satellite" }: Props) {
  const [active, setActive] = useState<MapStyle>(initial);
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-700 bg-ink-900/85 p-0.5 backdrop-blur">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const isActive = active === o.key;
        return (
          <button
            key={o.key}
            onClick={() => {
              setActive(o.key);
              onChange(o.key);
            }}
            title={o.label}
            aria-label={o.label}
            className={
              "inline-flex h-7 w-7 items-center justify-center rounded transition " +
              (isActive
                ? "bg-accent text-white"
                : "text-ink-300 hover:bg-ink-800 hover:text-ink-100")
            }
          >
            <Icon size={13} />
          </button>
        );
      })}
    </div>
  );
}
