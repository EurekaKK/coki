import { create } from "zustand";

interface AppState {
  currentRunId: string | null;
  isRunning: boolean;
  phase: string;
  progress: number;
  logs: Array<{ level: string; message: string; phase: string }>;
  error: string | null;

  setCurrentRunId: (id: string | null) => void;
  setIsRunning: (running: boolean) => void;
  setPhase: (phase: string) => void;
  setProgress: (progress: number) => void;
  addLog: (log: { level: string; message: string; phase: string }) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRunId: null,
  isRunning: false,
  phase: "idle",
  progress: 0,
  logs: [],
  error: null,

  setCurrentRunId: (id) => set({ currentRunId: id }),
  setIsRunning: (running) => set({ isRunning: running }),
  setPhase: (phase) => set({ phase }),
  setProgress: (progress) => set({ progress }),
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      currentRunId: null,
      isRunning: false,
      phase: "idle",
      progress: 0,
      logs: [],
      error: null,
    }),
}));
