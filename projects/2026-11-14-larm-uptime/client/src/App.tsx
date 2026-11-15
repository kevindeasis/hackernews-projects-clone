import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import MonitorPage from "./pages/MonitorPage";
import Settings from "./pages/Settings";
import StatusPageAdmin from "./pages/StatusPageAdmin";
import PublicStatusPage from "./pages/PublicStatusPage";

export default function App() {
  const { pathname } = useLocation();
  // The public status page is a standalone view without the admin chrome.
  if (pathname.startsWith("/status/")) {
    return (
      <Routes>
        <Route path="/status/:slug" element={<PublicStatusPage />} />
      </Routes>
    );
  }
  return (
    <div className="shell">
      <header>
        <strong className="brand">◉ Larm <small>clone</small></strong>
        <nav>
          <NavLink to="/" end>Monitors</NavLink>
          <NavLink to="/status-pages">Status pages</NavLink>
          <NavLink to="/settings">Alerts</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitors/:id" element={<MonitorPage />} />
          <Route path="/status-pages" element={<StatusPageAdmin />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
