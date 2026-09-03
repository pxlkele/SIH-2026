import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { Loader } from "./pages/Loader";
import Home from "./pages/Home";
import MainApp from "./pages/MainApp";
import DemoView from "./pages/DemoView";

const LOADER_MS = 1800;

/**
 * Routing:
 *   /       → Loader (~1.8s) → Home. Home has settings, big Navigate CTA,
 *             recent-drive card, replay link.
 *   /app    → the product view. Interactive map + turn-by-turn nav.
 *   /demo   → the pitch showcase. Split-screen raw vs Kalman replay.
 *
 * FirstMountLoader wraps the whole route tree. It only mounts once per
 * page load (React Router navigation doesn't remount App), so:
 *   - hard refresh / new tab / fresh URL → loader shows
 *   - clicking Home ↔ App ↔ Demo links       → loader is skipped
 */
export default function App() {
  return (
    <FirstMountLoader>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/app" element={<MainApp />} />
        <Route path="/demo" element={<DemoView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </FirstMountLoader>
  );
}

function FirstMountLoader({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), LOADER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {loading ? <Loader key="global-loader" /> : <div key={`app-${location.pathname}`}>{children}</div>}
    </AnimatePresence>
  );
}
