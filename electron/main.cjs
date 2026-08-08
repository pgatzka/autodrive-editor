const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const isDev = !!process.env.VITE_DEV_SERVER_URL;

const GITHUB_OWNER = "pgatzka";
const GITHUB_REPO = "autodrive-editor";
const USER_AGENT = "autodrive-editor";

function blueprintsFile() {
  return path.join(app.getPath("userData"), "blueprints.json");
}

function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
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

// ---------- IPC: savegame background ----------

// Accepts a savegame folder or any file inside it (e.g. the opened
// AutoDrive_config.xml) and returns the background-relevant files.
ipcMain.handle("background:read", async (event, { pathOrFolder }) => {
  let folder = pathOrFolder;
  try {
    if (fs.statSync(folder).isFile()) folder = path.dirname(folder);
  } catch {
    return null;
  }
  const heightmapPath = path.join(folder, "terrain.heightmap.png");
  if (!fs.existsSync(heightmapPath)) return null;
  const readText = (name) => {
    try {
      return fs.readFileSync(path.join(folder, name), "utf-8");
    } catch {
      return null;
    }
  };
  const readBinary = (name) => {
    try {
      return fs.readFileSync(path.join(folder, name));
    } catch {
      return null;
    }
  };
  return {
    folder,
    heightmap: fs.readFileSync(heightmapPath),
    typeCache: readBinary("terrain.lod.type.cache"),
    careerXml: readText("careerSavegame.xml"),
    placeablesXml: readText("placeables.xml"),
    vehiclesXml: readText("vehicles.xml"),
  };
});

ipcMain.handle("background:pickFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Pick a savegame folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ---------- IPC: app settings (update channel, token, ...) ----------

ipcMain.handle("settings:load", async () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf-8"));
  } catch {
    return {};
  }
});

ipcMain.handle("settings:save", async (event, settings) => {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), "utf-8");
  return true;
});

// ---------- IPC: updates ----------

ipcMain.handle("app:version", () => app.getVersion());

function githubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// Lists releases. With a token that has repo access this includes draft
// releases (the unstable channel); anonymously only published releases appear.
ipcMain.handle("update:check", async (event, { token }) => {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=30`;
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (!res.ok) {
    throw new Error(`GitHub API error: HTTP ${res.status}${res.status === 401 ? " (invalid token?)" : ""}`);
  }
  const releases = await res.json();
  return releases.map((r) => {
    const rawTag = String(r.tag_name || "");
    // drafts created without an explicit tag get a placeholder tag_name; the
    // version is then only in the release name
    const versionSource = !rawTag || /^untagged-/.test(rawTag) ? String(r.name || "") : rawTag;
    return {
    tag: rawTag,
    version: versionSource.replace(/^v/, ""),
    name: r.name || r.tag_name,
    draft: !!r.draft,
    prerelease: !!r.prerelease,
    createdAt: r.created_at,
    publishedAt: r.published_at,
    htmlUrl: r.html_url,
    body: r.body || "",
    assets: (r.assets || []).map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      // the asset API endpoint works for drafts (with token) and public releases alike
      apiUrl: a.url,
    })),
    };
  });
});

ipcMain.handle("update:download", async (event, { asset, token }) => {
  const headers = githubHeaders(token);
  headers.Accept = "application/octet-stream";
  const res = await fetch(asset.apiUrl, { headers });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const dest = path.join(app.getPath("downloads"), asset.name);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  let launched = false;
  if (process.platform === "win32" && dest.toLowerCase().endsWith(".exe")) {
    // start the installer; NSIS updates in place
    launched = (await shell.openPath(dest)) === "";
  } else {
    shell.showItemInFolder(dest);
  }
  return { path: dest, launched };
});

ipcMain.handle("update:openUrl", async (event, url) => {
  if (typeof url === "string" && /^https:\/\/github\.com\//.test(url)) {
    await shell.openExternal(url);
  }
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
