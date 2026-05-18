import electron from "electron";
const { contextBridge, ipcRenderer } = electron;

const api = {
  research: {
    start: (query: string, options?: { depth?: number; outputLanguage?: string; collectionId?: string }) =>
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
    exportMarkdown: (filename: string, content: string) =>
      ipcRenderer.invoke("research:exportMarkdown", filename, content),
  },
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    update: (patch: Record<string, unknown>) =>
      ipcRenderer.invoke("config:update", patch),
  },
  documents: {
    getCollections: () => ipcRenderer.invoke("documents:getCollections"),
    createCollection: (name: string, description?: string) =>
      ipcRenderer.invoke("documents:createCollection", name, description),
    deleteCollection: (id: string) =>
      ipcRenderer.invoke("documents:deleteCollection", id),
    getDocuments: (collectionId: string) =>
      ipcRenderer.invoke("documents:getDocuments", collectionId),
    importFiles: (collectionId: string) =>
      ipcRenderer.invoke("documents:importFiles", collectionId),
    deleteDocument: (documentId: string) =>
      ipcRenderer.invoke("documents:deleteDocument", documentId),
    search: (collectionId: string, query: string) =>
      ipcRenderer.invoke("documents:search", collectionId, query),
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
