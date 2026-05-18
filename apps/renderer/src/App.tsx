import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Report } from "./pages/Report";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Library } from "./pages/Library";
import { Timeline } from "./components/Timeline";

function AppRoutes() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("fadeIn");

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage("fadeOut");
      const timer = setTimeout(() => {
        setDisplayLocation(location);
        setTransitionStage("fadeIn");
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [location, displayLocation]);

  return (
    <div
      className="transition-opacity duration-150 ease-out"
      style={{ opacity: transitionStage === "fadeIn" ? 1 : 0 }}
    >
      <Routes location={displayLocation}>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard/:runId" element={<Dashboard />} />
        <Route path="/report/:runId" element={<Report />} />
        <Route path="/history" element={<History />} />
        <Route path="/timeline/:runId" element={<Timeline />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/library" element={<Library />} />
      </Routes>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto min-w-0">
          <AppRoutes />
        </main>
      </div>
    </HashRouter>
  );
}
