const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("adBridge", {
  openXml: () => ipcRenderer.invoke("xml:open"),
  saveXml: (suggestedPath, content) => ipcRenderer.invoke("xml:save", { suggestedPath, content }),
  saveXmlTo: (path, content) => ipcRenderer.invoke("xml:saveTo", { path, content }),
  loadBlueprints: () => ipcRenderer.invoke("blueprints:load"),
  storeBlueprints: (blueprints) => ipcRenderer.invoke("blueprints:store", blueprints),
  exportBlueprint: (blueprint) => ipcRenderer.invoke("blueprints:export", blueprint),
  importBlueprints: () => ipcRenderer.invoke("blueprints:import"),
  readBackground: (pathOrFolder) => ipcRenderer.invoke("background:read", { pathOrFolder }),
  pickBackgroundFolder: () => ipcRenderer.invoke("background:pickFolder"),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkUpdates: (token) => ipcRenderer.invoke("update:check", { token }),
  downloadUpdate: (asset, token) => ipcRenderer.invoke("update:download", { asset, token }),
  openReleasePage: (url) => ipcRenderer.invoke("update:openUrl", url),
  platform: process.platform,
});
