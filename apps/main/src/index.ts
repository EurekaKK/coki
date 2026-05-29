import electron from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";
const { app, BrowserWindow } = electron;
import { join } from "node:path";
import { CokiDatabase, ConfigManager, ResearchEngine } from "@coki/engine";
import { registerIPCHandlers } from "./ipc";
import { setupSecurity } from "./security";
import { SecretStore } from "./secret-store";

let mainWindow: BrowserWindowType | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, "../../preload/dist/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  setupSecurity(mainWindow);

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(join(__dirname, "../../renderer/dist/index.html"));
  }
}

app.whenReady().then(async () => {
  const dbPath = join(app.getPath("userData"), "data.db");
  const db = new CokiDatabase(dbPath);
  db.markInterruptedRuns("应用重启或进程中断，任务未能继续运行。请重新发起研究。");
  const secretStore = new SecretStore(db);
  await secretStore.backfillPlainValues();
  const secrets = await secretStore.load();
  const persistedConfig = secretStore.loadConfig();

  // Build config overrides from persisted values
  const configOverrides: Record<string, unknown> = {};
  if (persistedConfig["llm.baseUrl"] || persistedConfig["llm.model"] || persistedConfig["llm.thinking"]) {
    configOverrides.llm = {
      ...(persistedConfig["llm.baseUrl"] ? { baseUrl: persistedConfig["llm.baseUrl"] } : {}),
      ...(persistedConfig["llm.model"] ? { model: persistedConfig["llm.model"] } : {}),
      ...(persistedConfig["llm.thinking"] !== undefined ? { thinking: persistedConfig["llm.thinking"] === "true" } : {}),
    };
  }
  const roleNames = ["planner", "splitter", "subagent", "evaluator", "reflection", "synthesis"];
  const rolesOverride: Record<string, { model: string }> = {};
  for (const role of roleNames) {
    const model = persistedConfig[`role.${role}.model`];
    if (model) {
      rolesOverride[role] = { model };
    }
  }
  if (Object.keys(rolesOverride).length > 0) {
    configOverrides.roles = rolesOverride;
  }

  const config = new ConfigManager(configOverrides as any);
  const indexPath = join(app.getPath("userData"), "vectra-indexes");
  const engine = new ResearchEngine(db, configOverrides as any, secrets, { indexBasePath: indexPath });

  registerIPCHandlers(engine, db, config, secretStore, () => mainWindow);
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
