import { DEFAULT_MAJOR_EVERY } from "../model/grid";
import { bridge, store } from "./store";

/**
 * Grid settings belong to a map, not to the app: a 2 m grid aligned to one
 * map's roads is meaningless on another. They are therefore stored per map
 * name and restored when a config for that map is opened.
 */

export interface StoredGrid {
  size: number;
  offsetX: number;
  offsetZ: number;
  majorEvery: number;
}

const STORAGE_KEY = "gridByMap";
const LOCAL_STORAGE_KEY = "autodrive-editor.gridByMap";
/** Settings are saved a moment after the last change, not on every keystroke. */
const SAVE_DEBOUNCE_MS = 400;

export function currentGrid(): StoredGrid {
  const { gridSize, gridOffsetX, gridOffsetZ, gridMajorEvery } = store.state.settings;
  return { size: gridSize, offsetX: gridOffsetX, offsetZ: gridOffsetZ, majorEvery: gridMajorEvery };
}

export function applyGrid(grid: StoredGrid): void {
  store.update((s) => {
    s.settings.gridSize = grid.size;
    s.settings.gridOffsetX = grid.offsetX;
    s.settings.gridOffsetZ = grid.offsetZ;
    s.settings.gridMajorEvery = grid.majorEvery;
  });
}

/** Restore the grid stored for a map, if there is one. Returns what was applied. */
export async function restoreGridForMap(mapName: string): Promise<StoredGrid | null> {
  if (!mapName) return null;
  const stored = (await readAll())[mapName];
  if (!stored) return null;
  applyGrid(stored);
  store.update((s) => (s.statusMessage = `Grid settings restored for ${mapName}`));
  return stored;
}

export async function saveGridForMap(mapName: string, grid: StoredGrid): Promise<void> {
  if (!mapName) return;
  await writeAll({ ...(await readAll()), [mapName]: grid });
}

/**
 * Persist the grid whenever it settles, for whichever map is open. Returns an
 * unsubscribe function.
 */
export function watchGridSettings(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved = "";

  const unsubscribe = store.subscribe(() => {
    const mapName = store.state.network.mapName;
    // the blueprint workspace is not a map, so its grid is not stored
    if (!mapName || store.state.blueprintEdit) return;

    const grid = currentGrid();
    const snapshot = JSON.stringify({ mapName, grid });
    if (snapshot === lastSaved) return;
    lastSaved = snapshot;

    // the grid is captured here, not read when the timer fires: by then the
    // blueprint workspace may have taken over the settings
    clearTimeout(timer);
    timer = setTimeout(() => void saveGridForMap(mapName, grid), SAVE_DEBOUNCE_MS);
  });

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

export function defaultGrid(): StoredGrid {
  return { size: 2, offsetX: 0, offsetZ: 0, majorEvery: DEFAULT_MAJOR_EVERY };
}

// ---- storage: the app settings file in Electron, localStorage in a browser ----

/** The map name is a user value, so a lookup may find nothing. */
type GridsByMap = Partial<Record<string, StoredGrid>>;

async function readAll(): Promise<GridsByMap> {
  const adBridge = bridge();
  const raw = adBridge ? (await adBridge.loadSettings())[STORAGE_KEY] : readLocal();
  return isGridMap(raw) ? raw : {};
}

async function writeAll(all: GridsByMap): Promise<void> {
  const adBridge = bridge();
  if (adBridge) {
    const settings = await adBridge.loadSettings();
    await adBridge.saveSettings({ ...settings, [STORAGE_KEY]: all });
    return;
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(all));
}

function readLocal(): unknown {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function isGridMap(value: unknown): value is GridsByMap {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every(isStoredGrid);
}

function isStoredGrid(value: unknown): value is StoredGrid {
  if (typeof value !== "object" || value === null) return false;
  const grid = value as Record<string, unknown>;
  return (
    typeof grid.size === "number" &&
    typeof grid.offsetX === "number" &&
    typeof grid.offsetZ === "number" &&
    typeof grid.majorEvery === "number"
  );
}
