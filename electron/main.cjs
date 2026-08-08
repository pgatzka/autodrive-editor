const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function blueprintsFile() {
  return path.join(app.getPath("userData"), "blueprints.json");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#2b3a2e",
    title: "AutoDrive Editor",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// ---------- IPC: AutoDrive config XML ----------

ipcMain.handle("xml:open", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Open AutoDrive config",
    filters: [
      { name: "AutoDrive config", extensions: ["xml"] },
      { name: "All files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");
  return { path: filePath, content };
});

ipcMain.handle("xml:save", async (event, { suggestedPath, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: "Save AutoDrive config",
    defaultPath: suggestedPath || "AutoDrive_config.xml",
    filters: [{ name: "AutoDrive config", extensions: ["xml"] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, content, "utf-8");
  return { path: result.filePath };
});

ipcMain.handle("xml:saveTo", async (event, { path: filePath, content }) => {
  fs.writeFileSync(filePath, content, "utf-8");
  return { path: filePath };
});

// ---------- IPC: blueprint library (persisted in userData) ----------

ipcMain.handle("blueprints:load", async () => {
  try {
    return JSON.parse(fs.readFileSync(blueprintsFile(), "utf-8"));
  } catch {
    return [];
  }
});

ipcMain.handle("blueprints:store", async (event, blueprints) => {
  fs.mkdirSync(path.dirname(blueprintsFile()), { recursive: true });
  fs.writeFileSync(blueprintsFile(), JSON.stringify(blueprints, null, 2), "utf-8");
  return true;
});

ipcMain.handle("blueprints:export", async (event, blueprint) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const safeName = String(blueprint.name || "blueprint").replace(/[^\w\- ]+/g, "_");
  const result = await dialog.showSaveDialog(win, {
    title: "Export blueprint",
    defaultPath: `${safeName}.adbp.json`,
    filters: [{ name: "AutoDrive blueprint", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, JSON.stringify(blueprint, null, 2), "utf-8");
  return { path: result.filePath };
});

ipcMain.handle("blueprints:import", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Import blueprint",
    filters: [
      { name: "AutoDrive blueprint", extensions: ["json"] },
      { name: "All files", extensions: ["*"] },
    ],
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const imported = [];
  for (const p of result.filePaths) {
    try {
      imported.push(JSON.parse(fs.readFileSync(p, "utf-8")));
    } catch {
      // skip unreadable files; the renderer reports how many were imported
    }
  }
  return imported;
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
