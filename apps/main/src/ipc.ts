import electron from "electron";
const { ipcMain, BrowserWindow } = electron;
import type { ResearchEngine, CokiDatabase } from "@coki/engine";
import type { SecretStore } from "./secret-store";
import type { ConfigManager } from "@coki/engine";

export function registerIPCHandlers(
  engine: ResearchEngine,
  db: CokiDatabase,
  config: ConfigManager,
  secretStore: SecretStore,
  getMainWindow: () => BrowserWindow | null
): void {
  // Research
  ipcMain.handle("research:start", async (_event, query: string, options?: { depth?: number; outputLanguage?: string }) => {
    const runId = crypto.randomUUID();
    const mainWindow = getMainWindow();

    // Run pipeline in background, forward events to renderer
    const run = engine.runResearch(query, (options?.depth ?? 2) as 1 | 2 | 3, {
      outputLanguage: (options?.outputLanguage ?? "zh") as "zh" | "en",
    });

    (async () => {
      for await (const event of run) {
        mainWindow?.webContents.send("research:progress", event);
      }
    })();

    return runId;
  });

  ipcMain.handle("research:cancel", async (_event, runId: string) => {
    engine.cancelRun(runId);
  });

  ipcMain.handle("research:history", async () => {
    return engine.getHistory();
  });

  ipcMain.handle("research:report", async (_event, runId: string) => {
    return engine.getRun(runId);
  });

  ipcMain.handle("research:delete", async (_event, runId: string) => {
    engine.deleteRun(runId);
  });

  // Config
  ipcMain.handle("config:get", async () => {
    const cfg = config.getConfig();
    const status = secretStore.isConfigured();
    return {
      llm: {
        baseUrl: cfg.llm.baseUrl,
        model: cfg.llm.model,
        apiKeyConfigured: status.llm,
      },
      tavily: {
        apiKeyConfigured: status.tavily,
      },
    };
  });

  ipcMain.handle("config:update", async (_event, patch: Record<string, unknown>) => {
    // Handle API key updates through secret store
    if (patch.llmApiKey) {
      await secretStore.save("llm_api_key", patch.llmApiKey as string);
    }
    if (patch.tavilyApiKey) {
      await secretStore.save("tavily_api_key", patch.tavilyApiKey as string);
    }
  });
}
