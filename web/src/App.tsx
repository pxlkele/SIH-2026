import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeWithLoader />} />
      <Route path="/app" element={<MainApp />} />
      <Route path="/demo" element={<DemoView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HomeWithLoader() {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), LOADER_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence mode="wait">
      {loading ? <Loader key="loader" /> : <Home key="home" />}
    </AnimatePresence>
  );
}
