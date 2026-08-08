const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("adBridge", {
  openXml: () => ipcRenderer.invoke("xml:open"),
  saveXml: (suggestedPath, content) => ipcRenderer.invoke("xml:save", { suggestedPath, content }),
  saveXmlTo: (path, content) => ipcRenderer.invoke("xml:saveTo", { path, content }),
  loadBlueprints: () => ipcRenderer.invoke("blueprints:load"),
  storeBlueprints: (blueprints) => ipcRenderer.invoke("blueprints:store", blueprints),
  exportBlueprint: (blueprint) => ipcRenderer.invoke("blueprints:export", blueprint),
  importBlueprints: () => ipcRenderer.invoke("blueprints:import"),
});
