import { CloudDownload, CloudOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui";
import { DEMO_ROUTE_BBOX, precacheTiles } from "./tileCache";

/**
 * One-tap "make this area work offline" button. Fetches every Mapbox tile
 * inside the demo route's bbox for zooms 14-17 and both styles. Progress
 * bar shows fetch count.
 *
 * Once cached, airplane mode still renders the map for that area because
 * the service worker serves tiles from cache.
 */
export function OfflineCacheButton() {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "running"; done: number; total: number }
    | { kind: "done"; fetched: number; failed: number; cachedMB: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const start = async () => {
    setState({ kind: "running", done: 0, total: 1 });
    try {
      const r = await precacheTiles({
        bbox: DEMO_ROUTE_BBOX,
        onProgress: (done, total) => setState({ kind: "running", done, total }),
      });
      setState({ kind: "done", ...r });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  };

  if (state.kind === "running") {
    const pct = Math.round((state.done / state.total) * 100);
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-ink-700 bg-ink-900/85 px-3 py-1.5 text-xs backdrop-blur">
        <Loader2 size={12} className="animate-spin text-accent-bright" />
        <span className="text-ink-200">
          Caching tiles… <span className="tabular-nums text-ink-100">{pct}%</span>
        </span>
        <span className="text-ink-500 tabular-nums">
          {state.done}/{state.total}
        </span>
      </div>
    );
  }
  if (state.kind === "done") {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-status-ok/40 bg-status-ok/10 px-3 py-1.5 text-xs text-status-ok backdrop-blur">
        <CloudDownload size={12} />
        <span>
          Offline-ready · {state.fetched} tiles ({state.cachedMB} MB)
        </span>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-status-alert/50 bg-status-alert/10 px-3 py-1.5 text-xs text-status-alert backdrop-blur">
        <CloudOff size={12} />
        {state.message}
      </div>
    );
  }
  return (
    <Button variant="secondary" size="sm" onClick={start}>
      <CloudDownload size={12} />
      Cache for offline
    </Button>
  );
}
