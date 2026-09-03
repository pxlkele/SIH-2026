import { Navigate, Route, Routes } from "react-router-dom";
import MainApp from "./pages/MainApp";
import DemoView from "./pages/DemoView";

/**
 * Routing:
 *   /       → redirects to /app (product entry).
 *              Landing surface belongs to Charvi — when her marketing page
 *              lands, it takes over `/` and the redirect goes away.
 *   /app    → the product view. Interactive map + turn-by-turn nav.
 *   /demo   → the pitch showcase. Split-screen raw vs Kalman.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/app" element={<MainApp />} />
      <Route path="/demo" element={<DemoView />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
