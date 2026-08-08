import { MutableRefObject, RefObject, useCallback, useRef } from "react";
import {
  addNode,
  applyPositions,
  commitMove,
  connectOrCycle,
  gridRoute,
  Positions,
  setSelection,
  stampBlueprintAt,
  toggleSelection,
} from "../state/actions";
import { store } from "../state/store";
import { findNodeAt, findNodesInRect } from "./hitTest";
import { MarqueeRect } from "./renderScene";
import { createViewport, Viewport, worldRectFromScreen, zoomAt } from "./viewport";

/** A press that moved less than this many pixels counts as a click, not a drag. */
const CLICK_SLOP_PX = 3;
const ZOOM_STEP = 1.15;

interface Point {
  x: number;
  y: number;
}

interface WorldPoint {
  x: number;
  z: number;
}

type Drag =
  | { kind: "pan"; startScreen: Point; startCenter: { cx: number; cz: number } }
  | { kind: "move"; startScreen: Point; origins: Positions; grabbedId: number; moved: boolean }
  | { kind: "marquee"; startScreen: Point; current: Point; additive: boolean };

/** Everything a pointer event resolves to before any tool acts on it. */
interface PointerHit {
  viewport: Viewport;
  screen: Point;
  world: WorldPoint;
  snapped: WorldPoint;
}

export interface CanvasInteraction {
  onWheel: (event: React.WheelEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
  onMouseMove: (event: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  /** snapped cursor in world space, for ghost previews */
  cursorRef: RefObject<WorldPoint | null>;
  marqueeRef: RefObject<MarqueeRect | null>;
}

/**
 * Pointer handling for the editor canvas: resolves events to world
 * coordinates, dispatches to the active tool, and tracks the in-flight drag.
 * All resulting state changes go through `state/actions`.
 */
export function useCanvasInteraction(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  onCursorMove: (x: number, z: number) => void
): CanvasInteraction {
  const dragRef = useRef<Drag | null>(null);
  const chainFromRef = useRef<number | null>(null);
  const cursorRef = useRef<WorldPoint | null>(null);
  const marqueeRef = useRef<MarqueeRect | null>(null);

  const locate = useCallback(
    (event: { clientX: number; clientY: number }): PointerHit | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const viewport = createViewport(store.state.view, rect.width, rect.height);
      const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const world = { x: viewport.toWorldX(screen.x), z: viewport.toWorldZ(screen.y) };
      return { viewport, screen, world, snapped: { x: store.snapX(world.x), z: store.snapZ(world.z) } };
    },
    [canvasRef]
  );

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      const hit = locate(event);
      if (!hit) return;
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      store.update((s) => (s.view = zoomAt(s.view, hit.world.x, hit.world.z, factor)));
    },
    [locate]
  );

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      const hit = locate(event);
      if (!hit) return;

      // middle/right button pans regardless of the active tool
      if (event.button === 1 || event.button === 2) {
        dragRef.current = {
          kind: "pan",
          startScreen: hit.screen,
          startCenter: { cx: store.state.view.cx, cz: store.state.view.cz },
        };
        return;
      }
      if (event.button === 0) {
        dragRef.current = dispatchTool(hit, event, chainFromRef);
      }
    },
    [locate]
  );

  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const hit = locate(event);
      if (!hit) return;
      cursorRef.current = hit.snapped;
      onCursorMove(hit.world.x, hit.world.z);

      const drag = dragRef.current;
      if (drag) advanceDrag(drag, hit, marqueeRef);
    },
    [locate, onCursorMove]
  );

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    marqueeRef.current = null;
    if (!drag) return;

    if (drag.kind === "move") finishMove(drag);
    else if (drag.kind === "marquee") finishMarquee(drag, canvasRef.current);
  }, [canvasRef]);

  const onMouseLeave = useCallback(() => {
    dragRef.current = null;
    marqueeRef.current = null;
  }, []);

  return { onWheel, onMouseDown, onMouseMove, onMouseUp, onMouseLeave, cursorRef, marqueeRef };
}

/** Route a left-click to the active tool; returns a drag when one starts. */
function dispatchTool(
  hit: PointerHit,
  event: React.MouseEvent,
  chainFromRef: MutableRefObject<number | null>
): Drag | null {
  const state = store.state;
  switch (state.tool) {
    case "select":
      return beginSelectDrag(hit, event.shiftKey);
    case "add":
      chainFromRef.current = addNode(
        hit.snapped.x,
        hit.snapped.z,
        event.ctrlKey ? chainFromRef.current : null,
        state.settings.connectionMode
      );
      return null;
    case "connect":
    case "gridroute":
      applyTwoNodeTool(hit, state.tool);
      return null;
    case "place":
      stampBlueprintAt(hit.snapped.x, hit.snapped.z);
      return null;
  }
}

function beginSelectDrag(hit: PointerHit, additive: boolean): Drag {
  const marquee: Drag = { kind: "marquee", startScreen: hit.screen, current: hit.screen, additive };
  const node = findNodeAt(store.state.network, hit.world.x, hit.world.z, hit.viewport.scale);
  if (!node) return marquee;

  if (additive) toggleSelection(node.id);
  else if (!store.state.selection.has(node.id)) setSelection([node.id]);

  // shift-clicking a selected node deselects it, leaving nothing to drag
  if (!store.state.selection.has(node.id)) return marquee;

  const origins: Positions = new Map();
  for (const id of store.state.selection) {
    const waypoint = store.state.network.waypoints.get(id);
    if (waypoint) origins.set(id, { x: waypoint.x, z: waypoint.z });
  }
  return { kind: "move", startScreen: hit.screen, origins, grabbedId: node.id, moved: false };
}

/** Connect and grid-route both pick a start node, then act on the second click. */
function applyTwoNodeTool(hit: PointerHit, tool: "connect" | "gridroute"): void {
  const node = findNodeAt(store.state.network, hit.world.x, hit.world.z, hit.viewport.scale);
  if (!node) return;

  const from = store.state.pendingConnectFrom;
  if (from !== null && from !== node.id) {
    if (tool === "connect") connectOrCycle(from, node.id, store.state.settings.connectionMode);
    else gridRoute(from, node.id);
  }
  store.update((s) => (s.pendingConnectFrom = node.id));
}

function advanceDrag(drag: Drag, hit: PointerHit, marqueeRef: MutableRefObject<MarqueeRect | null>): void {
  const scale = store.state.view.scale;
  const dx = (hit.screen.x - drag.startScreen.x) / scale;
  const dz = (hit.screen.y - drag.startScreen.y) / scale;

  if (drag.kind === "pan") {
    store.update((s) => {
      s.view = { ...s.view, cx: drag.startCenter.cx - dx, cz: drag.startCenter.cz - dz };
    });
    return;
  }
  if (drag.kind === "move") {
    const grabbed = drag.origins.get(drag.grabbedId);
    if (!grabbed) return;
    // snap the grabbed node; the rest of the selection follows rigidly
    const snappedDX = store.snapX(grabbed.x + dx) - grabbed.x;
    const snappedDZ = store.snapZ(grabbed.z + dz) - grabbed.z;
    drag.moved = drag.moved || Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01;
    applyPositions(offsetPositions(drag.origins, snappedDX, snappedDZ));
    return;
  }
  drag.current = hit.screen;
  marqueeRef.current = {
    x0: drag.startScreen.x,
    y0: drag.startScreen.y,
    x1: hit.screen.x,
    y1: hit.screen.y,
  };
  store.notify();
}

/** Collapse the live drag into a single undoable step. */
function finishMove(drag: Extract<Drag, { kind: "move" }>): void {
  if (!drag.moved) return;
  const finals: Positions = new Map();
  for (const id of drag.origins.keys()) {
    const waypoint = store.state.network.waypoints.get(id);
    if (waypoint) finals.set(id, { x: waypoint.x, z: waypoint.z });
  }
  commitMove(drag.origins, finals);
}

/** A drag selects the enclosed nodes; a plain click on empty space clears the selection. */
function finishMarquee(drag: Extract<Drag, { kind: "marquee" }>, canvas: HTMLCanvasElement | null): void {
  const wasClick =
    Math.abs(drag.startScreen.x - drag.current.x) < CLICK_SLOP_PX &&
    Math.abs(drag.startScreen.y - drag.current.y) < CLICK_SLOP_PX;
  if (wasClick) {
    if (!drag.additive) setSelection([]);
    return;
  }
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const viewport = createViewport(store.state.view, rect.width, rect.height);
  const worldRect = worldRectFromScreen(
    viewport,
    drag.startScreen.x,
    drag.startScreen.y,
    drag.current.x,
    drag.current.y
  );
  const picked = new Set(drag.additive ? store.state.selection : []);
  for (const id of findNodesInRect(store.state.network, worldRect)) picked.add(id);
  setSelection(picked, `${picked.size} node(s) selected`);
}

function offsetPositions(origins: Positions, dx: number, dz: number): Positions {
  const moved: Positions = new Map();
  for (const [id, position] of origins) {
    moved.set(id, { x: position.x + dx, z: position.z + dz });
  }
  return moved;
}
