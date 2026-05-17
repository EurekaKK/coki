import electron from "electron";
const { contextBridge, ipcRenderer } = electron;

const api = {
  research: {
    start: (query: string, options?: { depth?: number; outputLanguage?: string }) =>
      ipcRenderer.invoke("research:start", query, options),
    cancel: (runId: string) =>
      ipcRenderer.invoke("research:cancel", runId),
    history: () =>
      ipcRenderer.invoke("research:history"),
    report: (runId: string) =>
      ipcRenderer.invoke("research:report", runId),
    delete: (runId: string) =>
      ipcRenderer.invoke("research:delete", runId),
    llmCalls: (runId: string) =>
      ipcRenderer.invoke("research:llmCalls", runId),
    costSummary: (runId: string) =>
      ipcRenderer.invoke("research:costSummary", runId),
    timeline: (runId: string) =>
      ipcRenderer.invoke("research:timeline", runId),
    rerun: (runId: string, mode: "full" | "reuse-sources" | "reuse-plan") =>
      ipcRenderer.invoke("research:rerun", runId, mode),
  },
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    update: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke("config:update", patch),
  },
  on: {
    researchProgress: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on("research:progress", handler);
      return () => {
        ipcRenderer.removeListener("research:progress", handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("coki", api);

export type CokiAPI = typeof api;
