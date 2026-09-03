import { Navigate, Route, Routes } from "react-router-dom";
import Splash from "./pages/Splash";
import MainApp from "./pages/MainApp";
import DemoView from "./pages/DemoView";

/**
 * Routing:
 *   /       → Splash. Full black, wordmark centered, gooey loader.
 *              Auto-navigates to /app after ~1.8s. Reserved for Charvi
 *              to replace with a proper marketing landing later.
 *   /app    → the product view. Interactive map + turn-by-turn nav.
 *   /demo   → the pitch showcase. Split-screen raw vs Kalman replay.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="/app" element={<MainApp />} />
      <Route path="/demo" element={<DemoView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
