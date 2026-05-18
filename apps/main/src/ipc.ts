import electron from "electron";
const { ipcMain, BrowserWindow, dialog } = electron;
import { readFileSync, existsSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import type { ResearchEngine, CokiDatabase, DocumentManager } from "@coki/engine";
import type { SecretStore } from "./secret-store";
import type { ConfigManager } from "@coki/engine";

export function registerIPCHandlers(
  engine: ResearchEngine,
  db: CokiDatabase,
  config: ConfigManager,
  secretStore: SecretStore,
  getMainWindow: () => BrowserWindow | null,
  documentManager: DocumentManager | null,
): void {
  // Research
  ipcMain.handle("research:start", async (_event, query: string, options?: { depth?: number; outputLanguage?: string }) => {
    const runId = crypto.randomUUID();
    const mainWindow = getMainWindow();

    // Run pipeline in background, forward events to renderer
    const gen = engine.runResearch(query, (options?.depth ?? 2) as 1 | 2 | 3, {
      outputLanguage: (options?.outputLanguage ?? "zh") as "zh" | "en",
      runId,
    });

    (async () => {
      for await (const event of gen) {
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

  ipcMain.handle("research:llmCalls", async (_event, runId: string) => {
    return db.getLLMCallsByRun(runId);
  });

  ipcMain.handle("research:costSummary", async (_event, runId: string) => {
    const calls = db.getLLMCallsByRun(runId);
    const totalInput = calls.reduce((s, c) => s + (c.input_tokens ?? 0), 0);
    const totalOutput = calls.reduce((s, c) => s + (c.output_tokens ?? 0), 0);
    const totalLatency = calls.reduce((s, c) => s + (c.latency_ms ?? 0), 0);
    const byPhase: Record<string, { calls: number; inputTokens: number; outputTokens: number }> = {};
    for (const call of calls) {
      const phase = call.role ?? "unknown";
      if (!byPhase[phase]) byPhase[phase] = { calls: 0, inputTokens: 0, outputTokens: 0 };
      byPhase[phase].calls++;
      byPhase[phase].inputTokens += call.input_tokens ?? 0;
      byPhase[phase].outputTokens += call.output_tokens ?? 0;
    }
    return { totalInput, totalOutput, totalLatency, callCount: calls.length, byPhase };
  });

  ipcMain.handle("research:timeline", async (_event, runId: string) => {
    const logPath = join(process.env.HOME ?? "/tmp", "Library/Logs/@coki/main/coki.log");
    if (!existsSync(logPath)) return [];

    const content = readFileSync(logPath, "utf-8");
    const logs: Array<{
      id: number;
      run_id: string;
      phase: string | null;
      event_type: string | null;
      message: string | null;
      details: string | null;
      level: string;
      created_at: string;
    }> = [];
    let id = 0;

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.runId !== runId) continue;

        const levelMap: Record<number, string> = { 10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal" };
        const level = levelMap[entry.level] ?? "info";

        // Build details from extra fields (exclude standard ones)
        const { time, level: _l, pid, hostname, runId: _r, msg, component, phase, ...rest } = entry;
        const details = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;

        logs.push({
          id: id++,
          run_id: runId,
          phase: phase ?? component ?? null,
          event_type: component ?? null,
          message: msg ?? null,
          details,
          level,
          created_at: entry.time ?? "",
        });
      } catch {
        // skip unparseable lines
      }
    }
    return logs;
  });

  ipcMain.handle("research:exportMarkdown", async (_event, filename: string, content: string) => {
    const mainWindow = getMainWindow();
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: filename,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    writeFileSync(result.filePath, content, "utf-8");
    return { saved: true, filePath: result.filePath };
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

    // Sync role models to LLM client
    if (Object.keys(rolesOverride).length > 0) {
      const roleModels: Record<string, string> = {};
      for (const role of roleNames) {
        const m = config.getRole(role).model;
        if (m) roleModels[role] = m;
      }
      engine.updateRoleModels(roleModels);
    }
  });

  // Documents
  ipcMain.handle("documents:getCollections", async () => {
    if (!documentManager) return [];
    return documentManager.listCollections();
  });

  ipcMain.handle("documents:createCollection", async (_event, name: string, description?: string) => {
    if (!documentManager) throw new Error("Document manager not initialized");
    return documentManager.createCollection({ name, description });
  });

  ipcMain.handle("documents:deleteCollection", async (_event, id: string) => {
    if (!documentManager) throw new Error("Document manager not initialized");
    await documentManager.deleteCollection(id);
  });

  ipcMain.handle("documents:getDocuments", async (_event, collectionId: string) => {
    if (!documentManager) return [];
    return documentManager.listDocuments(collectionId);
  });

  ipcMain.handle("documents:importFiles", async (_event, collectionId: string) => {
    if (!documentManager) throw new Error("Document manager not initialized");
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error("No main window");

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Documents", extensions: ["txt", "md", "pdf"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) return [];

    const imported: Array<{ id: string; filename: string; status: string }> = [];
    const docsDir = join(electron.app.getPath("userData"), "documents", collectionId);
    mkdirSync(docsDir, { recursive: true });

    for (const filePath of result.filePaths) {
      const filename = filePath.split("/").pop() ?? "unknown";
      const ext = extname(filename).slice(1).toLowerCase();
      if (!["txt", "md", "pdf"].includes(ext)) continue;

      const docId = crypto.randomUUID();
      const destPath = join(docsDir, `${docId}.${ext}`);
      copyFileSync(filePath, destPath);

      try {
        const id = await documentManager.importDocument(collectionId, filename, destPath);
        imported.push({ id, filename, status: "ready" });
      } catch (err) {
        imported.push({ id: docId, filename, status: "error" });
      }
    }

    return imported;
  });

  ipcMain.handle("documents:deleteDocument", async (_event, documentId: string) => {
    if (!documentManager) throw new Error("Document manager not initialized");
    await documentManager.deleteDocument(documentId);
  });

  ipcMain.handle("documents:search", async (_event, collectionId: string, query: string) => {
    if (!documentManager) throw new Error("Document manager not initialized");
    return documentManager.search(collectionId, query);
  });
}
