import { nodeHeightAt } from "../model/background";
import { stampBlueprint } from "../model/blueprint";
import {
  addWaypoint,
  connect,
  connectAcrossGrid,
  connectionBetween,
  cycleConnection,
  deleteWaypoints,
  deletionImpact,
  disconnect,
  evenlySpaceChain,
  findStackedGroups,
  insertMidpoint,
  MergeResult,
  mergeStacked,
  orderAsChain,
  setFlagOn,
  smoothCurve,
} from "../model/graph";
import { offsetForPosition } from "../model/grid";
import { plural } from "../model/text";
import { ConnectionMode } from "../model/types";
import { closeDialog, confirmAction, showToast } from "./feedback";
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
    const created = connectAcrossGrid(s.network, fromId, toId, store.grid(), s.settings.connectionMode);
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

/**
 * Fold every stack of nodes sharing a spot into one node. Nodes vanish here,
 * so the toast carries Undo the way a delete does, and the survivors are
 * selected — they are the only evidence left that anything happened.
 */
export function mergeStackedNodes(): void {
  const groups = findStackedGroups(store.state.network);
  if (groups.length === 0) {
    store.update((s) => (s.statusMessage = "No stacked nodes found"));
    return;
  }

  let result = { groups: 0, nodes: 0, connections: 0, markers: 0 };
  store.mutate((s) => {
    result = mergeStacked(s.network, groups);
    s.selection = new Set(groups.map((group) => group.keepId));
    s.statusMessage = mergeHeadline(result);
  });
  showToast("info", mergeHeadline(result), {
    detail: describeMerge(result),
    undo: () => store.undo(),
  });
}

function mergeHeadline(result: MergeResult): string {
  return `Merged ${plural(result.nodes, "stacked node")} at ${plural(result.groups, "spot")}`;
}

/** What the merge cost, so nothing disappears without being named. */
function describeMerge(result: MergeResult): string {
  const parts: string[] = [];
  if (result.connections > 0) parts.push(`${plural(result.connections, "duplicate link")} removed`);
  if (result.markers > 0) parts.push(`${plural(result.markers, "marker")} dropped`);
  return parts.length > 0 ? parts.join(", ") : "Every connection and marker kept";
}

/** Above this many nodes a delete asks first, so the dialog never becomes noise. */
export const DELETE_CONFIRM_THRESHOLD = 5;
const DELETE_SUPPRESS_KEY = "delete-waypoints";

/**
 * Delete the selection, asking first when the loss is large. The dialog names
 * collateral damage the user cannot see — links leaving the selection and
 * markers riding along — and the resulting toast carries Undo itself.
 */
export function requestDeleteSelection(): void {
  const state = store.state;
  if (state.selection.size === 0) return;

  const impact = deletionImpact(state.network, state.selection);
  if (impact.nodes <= DELETE_CONFIRM_THRESHOLD) {
    deleteSelection();
    return;
  }

  const ids = new Set(state.selection);
  store.update((s) => (s.pendingDeletion = ids));
  confirmAction({
    title: `Delete ${impact.nodes} waypoints?`,
    body: describeImpact(impact),
    detail: "Undoable with Ctrl+Z right after.",
    confirmLabel: "Delete waypoints",
    suppressKey: DELETE_SUPPRESS_KEY,
    onConfirm: () => {
      closeDialog();
      deleteSelection();
    },
  });
}

function describeImpact(impact: ReturnType<typeof deletionImpact>): string {
  const parts = [`This also removes ${impact.connections} connections`];
  if (impact.externalLinks > 0) {
    parts.push(`including ${impact.externalLinks} link(s) to waypoints outside the selection`);
  }
  if (impact.markers.length > 0) {
    parts.push(`and the marker${impact.markers.length > 1 ? "s" : ""} ${impact.markers.join(", ")}`);
  }
  return `${parts.join(", ")}.`;
}

export function deleteSelection(): void {
  const state = store.state;
  if (state.selection.size === 0) return;
  const impact = deletionImpact(state.network, state.selection);

  store.mutate((s) => {
    deleteWaypoints(s.network, s.selection);
    s.selection = new Set();
    s.pendingDeletion = null;
    s.statusMessage = `Deleted ${impact.nodes} waypoints`;
  });
  showToast("danger", `Deleted ${impact.nodes} waypoints`, {
    detail: `${impact.connections} connections removed`,
    undo: () => store.undo(),
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

/** Shift the grid so its lines cross this waypoint, then report the offsets. */
export function alignGridToWaypoint(wpId: number): void {
  store.update((s) => {
    const waypoint = s.network.waypoints.get(wpId);
    if (!waypoint) return;
    const { offsetX, offsetZ } = offsetForPosition(waypoint.x, waypoint.z, s.settings.gridSize);
    s.settings.gridOffsetX = offsetX;
    s.settings.gridOffsetZ = offsetZ;
    s.statusMessage = `Grid aligned to waypoint #${wpId} · offset ${offsetX} / ${offsetZ} m`;
  });
}

export function resetGridOffset(): void {
  store.update((s) => {
    s.settings.gridOffsetX = 0;
    s.settings.gridOffsetZ = 0;
    s.statusMessage = "Grid offset reset";
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
