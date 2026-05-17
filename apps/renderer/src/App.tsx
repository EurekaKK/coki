import { HashRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Report } from "./pages/Report";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Timeline } from "./components/Timeline";

export function App() {
  return (
    <HashRouter>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard/:runId" element={<Dashboard />} />
            <Route path="/report/:runId" element={<Report />} />
            <Route path="/history" element={<History />} />
            <Route path="/timeline/:runId" element={<Timeline />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
