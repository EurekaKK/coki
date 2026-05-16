import electron from "electron";
const { BrowserWindow, session, shell } = electron;

export function setupSecurity(mainWindow: BrowserWindow): void {
  // Block all permission requests
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // External links: open in system browser, https: only
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {
      // Ignore invalid URLs
    }
    return { action: "deny" };
  });

  // Navigation guard
  mainWindow.webContents.on("will-navigate", (event, url) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      event.preventDefault();
      return;
    }

    const isProdApp = parsed.protocol === "file:";
    const isDevServer =
      process.env.NODE_ENV === "development" &&
      parsed.protocol === "http:" &&
      parsed.hostname === "localhost";

    if (isProdApp || isDevServer) return;

    event.preventDefault();
    if (parsed.protocol === "https:") {
      shell.openExternal(url);
    }
  });
}
