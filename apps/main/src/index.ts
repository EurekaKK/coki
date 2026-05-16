import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { CokiDatabase, ConfigManager, ResearchEngine } from "@coki/engine";
import { registerIPCHandlers } from "./ipc";
import { setupSecurity } from "./security";
import { SecretStore } from "./secret-store";

let mainWindow: BrowserWindow | null = null;

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
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, "../../renderer/dist/index.html"));
  }
}

app.whenReady().then(async () => {
  const dbPath = join(app.getPath("userData"), "data.db");
  const db = new CokiDatabase(dbPath);
  const secretStore = new SecretStore(db);
  const secrets = await secretStore.load();
  const config = new ConfigManager({});
  const engine = new ResearchEngine(db, {}, secrets);

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
