import { nodeHeightAt } from "../model/background";
import { stampBlueprint } from "../model/blueprint";
import {
  addWaypoint,
  connect,
  connectAcrossGrid,
  connectionBetween,
  cycleConnection,
  deleteWaypoints,
  disconnect,
  evenlySpaceChain,
  insertMidpoint,
  orderAsChain,
  setFlagOn,
  smoothCurve,
} from "../model/graph";
import { ConnectionMode } from "../model/types";
import { store } from "./store";

/**
 * Every edit the UI can trigger, in one place. Components call these instead
 * of writing store mutations inline, so the same action behaves identically
 * whether it comes from the canvas, a sidebar button or a keyboard shortcut.
 */

/** Terrain heights only apply to the map, not to the origin-centered blueprint workspace. */
function heightAt(x: number, z: number): number {
  const state = store.state;
  return nodeHeightAt(state.blueprintEdit ? null : state.background, state.network, x, z);
}

export function addNode(x: number, z: number, connectFrom: number | null, mode: ConnectionMode): number {
  let newId = 0;
  store.mutate((s) => {
    const waypoint = addWaypoint(s.network, x, heightAt(x, z), z);
    newId = waypoint.id;
    if (connectFrom !== null && s.network.waypoints.has(connectFrom)) {
      connect(s.network, connectFrom, waypoint.id, mode);
    }
    s.statusMessage = `Node ${waypoint.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`;
  });
  return newId;
}

/** Connect two nodes, or cycle the connection type when they are already linked. */
export function connectOrCycle(fromId: number, toId: number, mode: ConnectionMode): void {
  store.mutate((s) => {
    if (connectionBetween(s.network, fromId, toId)) {
      cycleConnection(s.network, fromId, toId);
      const updated = connectionBetween(s.network, fromId, toId);
      s.statusMessage = updated
        ? `Connection ${updated.from} → ${updated.to}: ${updated.kind}`
        : "Connection removed";
    } else {
      connect(s.network, fromId, toId, mode);
      s.statusMessage = `Connected ${fromId} → ${toId} (${mode})`;
    }
  });
}

export function connectNodes(fromId: number, toId: number, mode: ConnectionMode): void {
  store.mutate((s) => {
    connect(s.network, fromId, toId, mode);
    s.statusMessage = `Connected ${fromId} → ${toId} (${mode})`;
  });
}

export function disconnectNodes(fromId: number, toId: number): void {
  store.mutate((s) => {
    disconnect(s.network, fromId, toId);
    s.statusMessage = "Disconnected";
  });
}

/** Straight route between two nodes with a node at every grid crossing. */
export function gridRoute(fromId: number, toId: number): void {
  store.mutate((s) => {
    const created = connectAcrossGrid(
      s.network,
      fromId,
      toId,
      s.settings.gridSize,
      s.settings.connectionMode
    );
    s.statusMessage = `Grid route ${fromId} → ${toId}: ${created.length} nodes inserted`;
  });
}

export function insertMidpointBetween(fromId: number, toId: number): void {
  store.mutate((s) => {
    const midId = insertMidpoint(s.network, fromId, toId);
    if (midId !== null) s.selection = new Set([midId]);
    s.statusMessage = midId !== null ? "Midpoint inserted" : "Nodes are not connected";
  });
}

export function createSmoothCurve(fromId: number, toId: number): void {
  store.mutate((s) => {
    const created = smoothCurve(s.network, fromId, toId, s.settings.curveSegments, s.settings.connectionMode);
    s.statusMessage =
      created.length > 0 ? `Curve with ${created.length} nodes created` : "Could not create curve";
  });
}

export function spaceSelectionEvenly(ids: Iterable<number>): void {
  store.mutate((s) => {
    const chain = orderAsChain(s.network, new Set(ids));
    if (!chain) {
      s.statusMessage = "Selection is not a single unbranched path";
      return;
    }
    evenlySpaceChain(s.network, chain);
    s.statusMessage = `Spaced ${chain.length} nodes evenly`;
  });
}

export function deleteSelection(): void {
  if (store.state.selection.size === 0) return;
  store.mutate((s) => {
    const count = s.selection.size;
    deleteWaypoints(s.network, s.selection);
    s.selection = new Set();
    s.statusMessage = `Deleted ${count} node(s)`;
  });
}

export function setSelectionFlag(flag: number, enabled: boolean): void {
  store.mutate((s) => setFlagOn(s.network, s.selection, flag, enabled));
}

export function stampBlueprintAt(x: number, z: number): void {
  const placement = store.state.placement;
  if (!placement) return;
  store.mutate((s) => {
    const ids = stampBlueprint(
      s.network,
      placement.blueprint,
      { x, z, rotation: placement.rotation },
      heightAt(x, z)
    );
    s.selection = new Set(ids);
    s.statusMessage = `Placed "${placement.blueprint.name}" (${ids.length} nodes) — click to stamp again, Esc to finish`;
  });
}

export type Positions = Map<number, { x: number; z: number }>;

/** Apply positions without an undo entry — used for live feedback while dragging. */
export function applyPositions(positions: Positions): void {
  store.update((s) => {
    for (const [id, position] of positions) {
      const waypoint = s.network.waypoints.get(id);
      if (waypoint) {
        waypoint.x = position.x;
        waypoint.z = position.z;
      }
    }
  });
}

/**
 * Turn a finished drag into a single undoable step: rewind to where the drag
 * started, then re-apply the final positions as one mutation.
 */
export function commitMove(origins: Positions, finals: Positions): void {
  applyPositions(origins);
  store.mutate((s) => {
    for (const [id, position] of finals) {
      const waypoint = s.network.waypoints.get(id);
      if (waypoint) {
        waypoint.x = position.x;
        waypoint.z = position.z;
      }
    }
    s.statusMessage = `Moved ${finals.size} node(s)`;
  });
}

export function selectAll(): void {
  store.update((s) => (s.selection = new Set(s.network.waypoints.keys())));
}

export function setSelection(ids: Iterable<number>, message?: string): void {
  store.update((s) => {
    s.selection = new Set(ids);
    if (message) s.statusMessage = message;
  });
}

export function toggleSelection(id: number): void {
  store.update((s) => {
    const selection = new Set(s.selection);
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    s.selection = selection;
  });
}

/** Escape: back out of placement, then a pending connection, then the selection. */
export function cancelCurrentInteraction(): void {
  store.update((s) => {
    if (s.placement) {
      s.placement = null;
      s.tool = "select";
    } else if (s.pendingConnectFrom !== null) {
      s.pendingConnectFrom = null;
    } else {
      s.selection = new Set();
    }
  });
}

export function focusOnWaypoint(wpId: number): void {
  store.update((s) => {
    const waypoint = s.network.waypoints.get(wpId);
    if (!waypoint) return;
    s.view = { cx: waypoint.x, cz: waypoint.z, scale: Math.max(s.view.scale, 3) };
    s.selection = new Set([wpId]);
  });
}
