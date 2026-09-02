import { Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import MainApp from "./pages/MainApp";
import DemoView from "./pages/DemoView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<MainApp />} />
      <Route path="/demo" element={<DemoView />} />
    </Routes>
  );
}
