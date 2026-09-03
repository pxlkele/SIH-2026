import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { Loader } from "./pages/Loader";
import Home from "./pages/Home";
import MainApp from "./pages/MainApp";
import DemoView from "./pages/DemoView";

const LOADER_MS = 1800;
const SESSION_KEY = "beacon.loaderShown";

/**
 * Routing:
 *   /       → Loader (~1.8s) → Home. Home has settings, big Navigate CTA,
 *             recent-drive card, replay link.
 *   /app    → the product view. Interactive map + turn-by-turn nav.
 *   /demo   → the pitch showcase. Split-screen raw vs Kalman replay.
 *
 * FirstMountLoader wraps the whole route tree: on every fresh page load
 * (any URL, once per browser session), the loader shows first. Subsequent
 * client-side navigations skip it.
 */
export default function App() {
  return (
    <FirstMountLoader>
      <Routes>
        <Route path="/" element={<HomeWithLoader />} />
        <Route path="/app" element={<MainApp />} />
        <Route path="/demo" element={<DemoView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </FirstMountLoader>
  );
}

/** Shows the loader briefly on the first mount of a browser session, then
 *  reveals children. Uses sessionStorage so refreshes re-trigger it but
 *  in-app navigation doesn't. */
function FirstMountLoader({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return false;
    return !sessionStorage.getItem(SESSION_KEY);
  });

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
      setLoading(false);
    }, LOADER_MS);
    return () => clearTimeout(t);
  }, [loading]);

  return (
    <AnimatePresence mode="wait">
      {loading ? <Loader key="global-loader" /> : <div key="app">{children}</div>}
    </AnimatePresence>
  );
}

/** Landing at `/` — after the global loader has faded, render Home. If the
 *  user navigates back to / from /app during the session, they see Home
 *  immediately (no extra loader). */
function HomeWithLoader() {
  const location = useLocation();
  // No local loader here — the global one handles first-mount. This wrapper
  // exists so we can add a future page-transition or route-guard cleanly.
  useLocation();
  useNavigate();
  return <Home key={location.pathname} />;
}
