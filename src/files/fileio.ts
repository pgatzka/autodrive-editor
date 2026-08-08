import { buildBackground } from "../model/background";
import { errorMessage } from "../model/errors";
import { parseAutoDriveXml, serializeAutoDriveXml } from "../model/xml";
import { restoreGridForMap } from "../state/gridPersistence";
import { bridge, store } from "../state/store";
import { Blueprint } from "../model/types";
import { isBlueprint } from "../model/blueprint";

function fitViewToNetwork() {
  const s = store.state;
  const wps = Array.from(s.network.waypoints.values());
  if (wps.length === 0) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const wp of wps) {
    minX = Math.min(minX, wp.x);
    maxX = Math.max(maxX, wp.x);
    minZ = Math.min(minZ, wp.z);
    maxZ = Math.max(maxZ, wp.z);
  }
  s.view.cx = (minX + maxX) / 2;
  s.view.cz = (minZ + maxZ) / 2;
  const spanX = Math.max(maxX - minX, 50);
  const spanZ = Math.max(maxZ - minZ, 50);
  const el = document.querySelector(".editor-canvas");
  const w = el instanceof HTMLElement ? el.clientWidth : 1200;
  const h = el instanceof HTMLElement ? el.clientHeight : 800;
  s.view.scale = Math.min(w / spanX, h / spanZ) * 0.9;
}

function applyOpenedXml(path: string | undefined, content: string) {
  const { network, originalText } = parseAutoDriveXml(content);
  store.update((s) => {
    s.network = network;
    s.originalXml = originalText;
    s.filePath = path;
    s.selection = new Set();
    s.pendingConnectFrom = null;
    s.placement = null;
    s.dirty = false;
    s.statusMessage = `Loaded ${network.waypoints.size} waypoints, ${network.markers.length} markers`;
  });
  fitViewToNetwork();
  store.clearHistory();
  store.notify();
  // grid settings belong to the map, so bring back the ones used last time
  void restoreGridForMap(network.mapName);
}

/**
 * Load the terrain background from a savegame folder (or any file inside one).
 * Silently does nothing when quiet and the folder has no heightmap.
 */
export async function loadBackgroundFrom(pathOrFolder: string, quiet: boolean) {
  const b = bridge();
  if (!b) return;
  try {
    const files = await b.readBackground(pathOrFolder);
    if (!files) {
      if (!quiet) store.update((s) => (s.statusMessage = "No terrain.heightmap.png found in that folder"));
      return;
    }
    const bg = await buildBackground(files);
    store.update((s) => {
      s.background = bg;
      s.statusMessage = `Background loaded: ${bg.mapTitle || "map"} (${bg.sizeMeters} m, ${bg.placeables.length} placeables, ${bg.vehicles.length} vehicles)`;
    });
  } catch (err) {
    if (!quiet) store.update((s) => (s.statusMessage = `Background failed: ${errorMessage(err)}`));
  }
}

export async function pickBackgroundFolder() {
  const b = bridge();
  if (!b) return;
  const folder = await b.pickBackgroundFolder();
  if (folder) await loadBackgroundFrom(folder, false);
}

export async function openConfig() {
  const b = bridge();
  if (b) {
    const result = await b.openXml();
    if (!result) return;
    try {
      applyOpenedXml(result.path, result.content);
      // configs live inside the savegame folder — pick up the terrain background automatically
      void loadBackgroundFrom(result.path, true);
    } catch (err) {
      store.update((s) => (s.statusMessage = `Open failed: ${errorMessage(err)}`));
    }
  } else {
    // browser fallback for `npm run dev` without electron
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        applyOpenedXml(undefined, await file.text());
      } catch (err) {
        store.update((s) => (s.statusMessage = `Open failed: ${errorMessage(err)}`));
      }
    };
    input.click();
  }
}

export async function saveConfig(saveAs = false) {
  const s = store.state;
  let content: string;
  try {
    content = serializeAutoDriveXml(s.network, s.originalXml);
  } catch (err) {
    store.update((st) => (st.statusMessage = `Save failed: ${errorMessage(err)}`));
    return;
  }
  const b = bridge();
  if (b) {
    if (s.filePath && !saveAs) {
      await b.saveXmlTo(s.filePath, content);
      store.update((st) => {
        st.dirty = false;
        st.statusMessage = `Saved ${st.network.waypoints.size} waypoints to ${s.filePath}`;
      });
    } else {
      const result = await b.saveXml(s.filePath ?? "AutoDrive_config.xml", content);
      if (!result) return;
      store.update((st) => {
        st.filePath = result.path;
        st.dirty = false;
        st.statusMessage = `Saved to ${result.path}`;
      });
    }
  } else {
    const blob = new Blob([content], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "AutoDrive_config.xml";
    a.click();
    URL.revokeObjectURL(a.href);
    store.update((st) => (st.dirty = false));
  }
}

export function newConfig() {
  if (store.state.dirty && !window.confirm("Discard unsaved changes?")) return;
  store.update((s) => {
    s.network = {
      waypoints: new Map(),
      markers: [],
      groups: ["All"],
      mapName: "",
      routeAuthor: "",
      routeVersion: "",
      nextId: 1,
    };
    s.originalXml = undefined;
    s.filePath = undefined;
    s.selection = new Set();
    s.pendingConnectFrom = null;
    s.placement = null;
    s.dirty = false;
    s.statusMessage = "New network";
  });
  store.clearHistory();
}

// ---- blueprint library persistence ----

const LS_KEY = "autodrive-editor.blueprints";

export async function loadBlueprintLibrary() {
  const b = bridge();
  const raw = b ? await b.loadBlueprints() : parseJson(localStorage.getItem(LS_KEY));
  const blueprints = (Array.isArray(raw) ? raw : []).filter(isBlueprint);
  store.update((s) => (s.blueprints = blueprints));
}

/** JSON.parse that yields undefined instead of throwing on bad input. */
function parseJson(text: string | null): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function persistBlueprintLibrary() {
  const blueprints = store.state.blueprints;
  const b = bridge();
  if (b) {
    await b.storeBlueprints(blueprints);
  } else {
    localStorage.setItem(LS_KEY, JSON.stringify(blueprints));
  }
}

export async function exportBlueprintFile(bp: Blueprint) {
  const b = bridge();
  if (b) {
    await b.exportBlueprint(bp);
  } else {
    const blob = new Blob([JSON.stringify(bp, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${bp.name.replace(/[^\w\- ]+/g, "_")}.adbp.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

export async function importBlueprintFiles() {
  const b = bridge();
  if (b) {
    const imported = await b.importBlueprints();
    if (!imported) return;
    const valid = imported.filter(isBlueprint);
    store.update((s) => {
      s.blueprints = [...s.blueprints, ...valid];
      s.statusMessage = `Imported ${valid.length} blueprint(s)`;
    });
    await persistBlueprintLibrary();
  } else {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      const valid: Blueprint[] = [];
      for (const f of files) {
        const parsed = parseJson(await f.text());
        if (isBlueprint(parsed)) valid.push(parsed);
      }
      store.update((s) => {
        s.blueprints = [...s.blueprints, ...valid];
        s.statusMessage = `Imported ${valid.length} blueprint(s)`;
      });
      await persistBlueprintLibrary();
    };
    input.click();
  }
}
