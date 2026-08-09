import { SavegameBackground } from "../model/background";
import { DEFAULT_MAJOR_EVERY, Grid, snapTo } from "../model/grid";
import { DEFAULT_STACK_TOLERANCE_M } from "../model/stacked";
import { Blueprint, ConnectionMode, RouteNetwork, emptyNetwork } from "../model/types";

export type Tool = "select" | "add" | "connect" | "gridroute" | "place";

export interface ViewTransform {
  /** world coords of the viewport center */
  cx: number;
  cz: number;
  /** pixels per meter */
  scale: number;
}

/** Feedback ladder: ambient status line, toast, toast+undo, blocking dialog. */
export type ToastKind = "success" | "info" | "danger";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  /** when set, the toast carries the recovery action itself */
  undo?: () => void;
  timeoutMs: number;
}

export interface ConfirmDialog {
  title: string;
  body: string;
  detail?: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** lets the user silence this class of confirmation for the session */
  suppressKey?: string;
}

export interface EditorSettings {
  gridSize: number;
  /** grid origin shift, so the grid can line up with what is already on the map */
  gridOffsetX: number;
  gridOffsetZ: number;
  /** cells per chunk — every Nth grid line is emphasised */
  gridMajorEvery: number;
  snapEnabled: boolean;
  /** how close two waypoints must be to count as one spot, in meters */
  mergeToleranceM: number;
  connectionMode: ConnectionMode;
  curveSegments: number;
  backgroundOpacity: number;
  showIcons: boolean;
}

/**
 * Copied nodes waiting to be pasted. The payload is a blueprint — the same
 * shape the library stores — so copy/paste and stamping share one
 * implementation of "these nodes, relative to a point".
 */
export interface ClipboardContents {
  blueprint: Blueprint;
  /** where the nodes were copied from, so a paste lands beside the original */
  origin: { x: number; z: number };
  /** pastes made from this clipboard, so repeated pastes cascade */
  pastes: number;
}

export interface PendingPlacement {
  blueprint: Blueprint;
  rotation: number;
}

/** Everything of the main editing session that gets stashed while the blueprint editor is open. */
export interface BlueprintEditStash {
  network: RouteNetwork;
  selection: Set<number>;
  view: ViewTransform;
  filePath?: string;
  originalXml?: string;
  dirty: boolean;
  statusMessage: string;
  history: { undo: Snapshot[]; redo: Snapshot[] };
}

export interface BlueprintEditSession {
  /** index into blueprints, or null while creating a new one */
  index: number | null;
  name: string;
  stash: BlueprintEditStash;
}

export interface EditorState {
  network: RouteNetwork;
  /** original XML text of the opened file (settings passthrough on save) */
  originalXml?: string;
  filePath?: string;
  selection: Set<number>;
  view: ViewTransform;
  tool: Tool;
  settings: EditorSettings;
  /** first node picked in connect / gridroute tools */
  pendingConnectFrom: number | null;
  placement: PendingPlacement | null;
  /** survives the blueprint workspace, so nodes can be copied into it */
  clipboard: ClipboardContents | null;
  blueprints: Blueprint[];
  /** non-null while the blueprint editor is open */
  blueprintEdit: BlueprintEditSession | null;
  /** terrain background loaded from a savegame folder */
  background: SavegameBackground | null;
  /** nodes about to be deleted, drawn red while the confirmation is open */
  pendingDeletion: Set<number> | null;
  toasts: Toast[];
  dialog: ConfirmDialog | null;
  shortcutsOpen: boolean;
  /** confirmations the user silenced for this session */
  suppressedConfirmations: Set<string>;
  dirty: boolean;
  statusMessage: string;
}

export interface Snapshot {
  network: RouteNetwork;
  selection: Set<number>;
}

function cloneNetwork(net: RouteNetwork): RouteNetwork {
  return {
    waypoints: new Map(
      Array.from(net.waypoints.values(), (wp) => [
        wp.id,
        { ...wp, out: [...wp.out], incoming: [...wp.incoming] },
      ])
    ),
    markers: net.markers.map((m) => ({ ...m })),
    groups: [...net.groups],
    mapName: net.mapName,
    routeAuthor: net.routeAuthor,
    routeVersion: net.routeVersion,
    nextId: net.nextId,
  };
}

const MAX_UNDO = 100;

export class EditorStore {
  state: EditorState = {
    network: emptyNetwork(),
    selection: new Set(),
    view: { cx: 0, cz: 0, scale: 2 },
    tool: "select",
    settings: {
      gridSize: 2,
      gridOffsetX: 0,
      gridOffsetZ: 0,
      gridMajorEvery: DEFAULT_MAJOR_EVERY,
      snapEnabled: true,
      mergeToleranceM: DEFAULT_STACK_TOLERANCE_M,
      connectionMode: "oneway",
      curveSegments: 6,
      backgroundOpacity: 0.85,
      showIcons: true,
    },
    pendingConnectFrom: null,
    placement: null,
    clipboard: null,
    blueprints: [],
    blueprintEdit: null,
    background: null,
    pendingDeletion: null,
    toasts: [],
    dialog: null,
    shortcutsOpen: false,
    suppressedConfirmations: new Set(),
    dirty: false,
    statusMessage: "Open an AutoDrive_config.xml or start placing nodes",
  };

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  notify() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Run a mutation that changes the network; records an undo snapshot. */
  mutate(fn: (s: EditorState) => void) {
    this.undoStack.push({
      network: cloneNetwork(this.state.network),
      selection: new Set(this.state.selection),
    });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    fn(this.state);
    this.state.dirty = true;
    this.notify();
  }

  /** Run a change that doesn't need undo (view, tool, selection, settings). */
  update(fn: (s: EditorState) => void) {
    fn(this.state);
    this.notify();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push({ network: this.state.network, selection: this.state.selection });
    this.state.network = snap.network;
    this.state.selection = snap.selection;
    this.state.dirty = true;
    this.notify();
  }

  redo() {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push({ network: this.state.network, selection: this.state.selection });
    this.state.network = snap.network;
    this.state.selection = snap.selection;
    this.state.dirty = true;
    this.notify();
  }

  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Stash/restore undo history around the blueprint editor session. */
  takeHistory(): { undo: Snapshot[]; redo: Snapshot[] } {
    const h = { undo: this.undoStack, redo: this.redoStack };
    this.undoStack = [];
    this.redoStack = [];
    return h;
  }

  restoreHistory(h: { undo: Snapshot[]; redo: Snapshot[] }) {
    this.undoStack = h.undo;
    this.redoStack = h.redo;
  }

  /** The grid as the canvas and the tools see it. */
  grid(): Grid {
    const { gridSize, gridOffsetX, gridOffsetZ, gridMajorEvery } = this.state.settings;
    return {
      size: gridSize,
      offsetX: gridOffsetX,
      offsetZ: gridOffsetZ,
      majorEvery: gridMajorEvery,
    };
  }

  snapX(value: number): number {
    const { gridSize, gridOffsetX, snapEnabled } = this.state.settings;
    return snapEnabled ? snapTo(value, gridSize, gridOffsetX) : value;
  }

  snapZ(value: number): number {
    const { gridSize, gridOffsetZ, snapEnabled } = this.state.settings;
    return snapEnabled ? snapTo(value, gridSize, gridOffsetZ) : value;
  }
}

export const store = new EditorStore();

// ---- bridge to Electron (degrades to browser-only mode for `vite` without electron) ----

export interface AdBridge {
  openXml(): Promise<{ path: string; content: string } | null>;
  saveXml(suggestedPath: string | undefined, content: string): Promise<{ path: string } | null>;
  saveXmlTo(path: string, content: string): Promise<{ path: string }>;
  loadBlueprints(): Promise<unknown[]>;
  storeBlueprints(blueprints: Blueprint[]): Promise<boolean>;
  exportBlueprint(blueprint: Blueprint): Promise<{ path: string } | null>;
  importBlueprints(): Promise<unknown[] | null>;
  readBackground(pathOrFolder: string): Promise<{
    folder: string;
    heightmap: Uint8Array;
    typeCache: Uint8Array | null;
    careerXml: string | null;
    placeablesXml: string | null;
    vehiclesXml: string | null;
  } | null>;
  pickBackgroundFolder(): Promise<string | null>;
  loadSettings(): Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): Promise<boolean>;
  getVersion(): Promise<string>;
  checkUpdates(token: string | undefined): Promise<unknown[]>;
  downloadUpdate(asset: unknown, token: string | undefined): Promise<{ path: string; launched: boolean }>;
  openReleasePage(url: string): Promise<void>;
  platform: string;
}

export function bridge(): AdBridge | null {
  return (window as unknown as { adBridge?: AdBridge }).adBridge ?? null;
}
