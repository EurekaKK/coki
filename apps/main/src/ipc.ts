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
    const roles: Record<string, { model: string }> = {};
    for (const name of Object.keys(cfg.roles)) {
      roles[name] = { model: config.getRole(name).model };
    }
    return {
      llm: {
        baseUrl: cfg.llm.baseUrl,
        model: cfg.llm.model,
        apiKeyConfigured: status.llm,
        thinking: cfg.llm.thinking,
      },
      tavily: {
        apiKeyConfigured: status.tavily,
      },
      roles,
    };
  });

  ipcMain.handle("config:update", async (_event, patch: Record<string, unknown>) => {
    // Handle API key updates through secret store
    const secretsUpdate: Record<string, string> = {};
    if (patch.llmApiKey) {
      await secretStore.save("llm_api_key", patch.llmApiKey as string);
      secretsUpdate.llmApiKey = patch.llmApiKey as string;
    }
    if (patch.tavilyApiKey) {
      await secretStore.save("tavily_api_key", patch.tavilyApiKey as string);
      secretsUpdate.tavilyApiKey = patch.tavilyApiKey as string;
    }
    if (Object.keys(secretsUpdate).length > 0) {
      engine.updateSecrets(secretsUpdate);
    }

    // Handle thinking mode update
    if (patch.llmThinking !== undefined) {
      engine.updateThinking(patch.llmThinking as boolean);
    }

    // Handle non-secret LLM config
    if (patch.llmBaseUrl !== undefined) {
      secretStore.saveConfig("llm.baseUrl", patch.llmBaseUrl as string);
    }
    if (patch.llmModel !== undefined) {
      secretStore.saveConfig("llm.model", patch.llmModel as string);
    }
    if (patch.llmThinking !== undefined) {
      secretStore.saveConfig("llm.thinking", String(patch.llmThinking));
    }

    // Handle per-role model overrides
    const roleNames = ["planner", "splitter", "subagent", "evaluator", "reflection", "synthesis", "citation"];
    const rolesOverride: Record<string, { model: string }> = {};
    for (const role of roleNames) {
      const key = `role.${role}.model`;
      if (patch[key] !== undefined) {
        secretStore.saveConfig(key, patch[key] as string);
        rolesOverride[role] = { model: patch[key] as string };
      }
    }

    // Apply live config update
    const enginePatch: Record<string, unknown> = {};
    if (patch.llmBaseUrl !== undefined || patch.llmModel !== undefined || patch.llmThinking !== undefined) {
      enginePatch.llm = {
        ...(patch.llmBaseUrl !== undefined ? { baseUrl: patch.llmBaseUrl } : {}),
        ...(patch.llmModel !== undefined ? { model: patch.llmModel } : {}),
        ...(patch.llmThinking !== undefined ? { thinking: patch.llmThinking } : {}),
      };
    }
    if (Object.keys(rolesOverride).length > 0) {
      enginePatch.roles = rolesOverride;
    }
    if (Object.keys(enginePatch).length > 0) {
      config.updateConfig(enginePatch as any);
    }
  });
}
