import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { api } from "./lib/api";
import { useAppStore } from "./stores/app-store";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Report } from "./pages/Report";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Library } from "./pages/Library";
import { Timeline } from "./components/Timeline";

function GlobalListener() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = api.on.researchProgress((event: unknown) => {
      const e = event as {
        type: string;
        runId?: string;
        phase?: string;
        message?: string;
        progress?: number;
      };
      if (!e.runId) return;

      if (e.type === "progress") {
        useAppStore.getState().setRunPhase(e.runId, e.phase ?? "unknown");
        useAppStore.getState().setRunProgress(e.runId, e.progress ?? 0);
        useAppStore.getState().addRunLog(e.runId, {
          level: "info",
          message: e.message ?? "",
          phase: e.phase ?? "unknown",
        });
      } else if (e.type === "error") {
        useAppStore.getState().setRunError(e.runId, e.message ?? "Unknown error");
        useAppStore.getState().setRunIsRunning(e.runId, false);
      } else if (e.type === "complete") {
        useAppStore.getState().setRunIsRunning(e.runId, false);
        if (location.pathname === `/dashboard/${e.runId}`) {
          navigate(`/report/${e.runId}`);
        }
      }
    });

    return unsubscribe;
  }, [navigate, location.pathname]);

  return null;
}

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
      <GlobalListener />
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto min-w-0">
          <AppRoutes />
        </main>
      </div>
    </HashRouter>
  );
}
