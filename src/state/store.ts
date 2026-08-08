import { Blueprint, ConnectionMode, RouteNetwork, emptyNetwork } from "../model/types";

export type Tool = "select" | "add" | "connect" | "gridroute" | "place";

export interface ViewTransform {
  /** world coords of the viewport center */
  cx: number;
  cz: number;
  /** pixels per meter */
  scale: number;
}

export interface EditorSettings {
  gridSize: number;
  snapEnabled: boolean;
  connectionMode: ConnectionMode;
  curveSegments: number;
}

export interface PendingPlacement {
  blueprint: Blueprint;
  rotation: number;
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
  blueprints: Blueprint[];
  dirty: boolean;
  statusMessage: string;
}

interface Snapshot {
  network: RouteNetwork;
  selection: Set<number>;
}

function cloneNetwork(net: RouteNetwork): RouteNetwork {
  return {
    waypoints: new Map(Array.from(net.waypoints.values(), (wp) => [
      wp.id,
      { ...wp, out: [...wp.out], incoming: [...wp.incoming] },
    ])),
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
    settings: { gridSize: 2, snapEnabled: true, connectionMode: "oneway", curveSegments: 6 },
    pendingConnectFrom: null,
    placement: null,
    blueprints: [],
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
    this.undoStack.push({ network: cloneNetwork(this.state.network), selection: new Set(this.state.selection) });
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

  snap(v: number): number {
    const { gridSize, snapEnabled } = this.state.settings;
    if (!snapEnabled || gridSize <= 0) return v;
    return Math.round(v / gridSize) * gridSize;
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
}

export function bridge(): AdBridge | null {
  return (window as unknown as { adBridge?: AdBridge }).adBridge ?? null;
}
