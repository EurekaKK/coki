import { create } from "zustand";

interface RunState {
  phase: string;
  progress: number;
  logs: Array<{ level: string; message: string; phase: string }>;
  isRunning: boolean;
  error: string | null;
}

const defaultRunState: RunState = {
  phase: "idle",
  progress: 0,
  logs: [],
  isRunning: false,
  error: null,
};

interface AppState {
  runs: Record<string, RunState>;

  getRun: (runId: string) => RunState;
  initRun: (runId: string) => void;
  setRunPhase: (runId: string, phase: string) => void;
  setRunProgress: (runId: string, progress: number) => void;
  addRunLog: (runId: string, log: { level: string; message: string; phase: string }) => void;
  setRunError: (runId: string, error: string | null) => void;
  setRunIsRunning: (runId: string, isRunning: boolean) => void;
  resetRun: (runId: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  runs: {},

  getRun: (runId) => get().runs[runId] ?? { ...defaultRunState },

  initRun: (runId) =>
    set((state) => ({
      runs: { ...state.runs, [runId]: { ...defaultRunState } },
    })),

  setRunPhase: (runId, phase) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [runId]: { ...(state.runs[runId] ?? defaultRunState), phase },
      },
    })),

  setRunProgress: (runId, progress) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [runId]: { ...(state.runs[runId] ?? defaultRunState), progress },
      },
    })),

  addRunLog: (runId, log) =>
    set((state) => {
      const run = state.runs[runId] ?? defaultRunState;
      return {
        runs: {
          ...state.runs,
          [runId]: { ...run, logs: [...run.logs, log] },
        },
      };
    }),

  setRunError: (runId, error) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [runId]: { ...(state.runs[runId] ?? defaultRunState), error },
      },
    })),

  setRunIsRunning: (runId, isRunning) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [runId]: { ...(state.runs[runId] ?? defaultRunState), isRunning },
      },
    })),

  resetRun: (runId) =>
    set((state) => ({
      runs: { ...state.runs, [runId]: { ...defaultRunState } },
    })),
}));
