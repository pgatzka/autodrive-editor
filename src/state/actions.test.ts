import { beforeEach, describe, expect, it } from "vitest";
import { connectionBetween } from "../model/graph";
import { captureBlueprint } from "../model/blueprint";
import { emptyNetwork, FLAG_SUBPRIO } from "../model/types";
import {
  addNode,
  alignGridToWaypoint,
  cancelCurrentInteraction,
  commitMove,
  connectOrCycle,
  deleteSelection,
  disconnectNodes,
  focusOnWaypoint,
  gridRoute,
  insertMidpointBetween,
  mergeStackedNodes,
  resetGridOffset,
  selectAll,
  setSelection,
  setSelectionFlag,
  spaceSelectionEvenly,
  stampBlueprintAt,
  toggleSelection,
} from "./actions";
import { store } from "./store";

beforeEach(() => {
  store.update((s) => {
    s.network = emptyNetwork();
    s.selection = new Set();
    s.blueprintEdit = null;
    s.background = null;
    s.placement = null;
    s.pendingConnectFrom = null;
    s.tool = "select";
    s.settings.gridSize = 2;
    s.settings.gridOffsetX = 0;
    s.settings.gridOffsetZ = 0;
    s.settings.snapEnabled = true;
    s.settings.connectionMode = "oneway";
    s.settings.curveSegments = 6;
  });
  store.clearHistory();
});

describe("addNode", () => {
  it("adds a node and optionally chains it to the previous one", () => {
    const first = addNode(0, 0, null, "oneway");
    const second = addNode(10, 0, first, "dual");

    expect(store.state.network.waypoints.size).toBe(2);
    expect(connectionBetween(store.state.network, first, second)).toMatchObject({ kind: "dual" });
  });

  it("ignores a chain source that no longer exists", () => {
    const id = addNode(0, 0, 999, "oneway");
    expect(store.state.network.waypoints.get(id)!.incoming).toEqual([]);
  });
});

describe("connectOrCycle", () => {
  it("connects first, then cycles the existing connection", () => {
    const a = addNode(0, 0, null, "oneway");
    const b = addNode(10, 0, null, "oneway");

    connectOrCycle(a, b, "oneway");
    expect(connectionBetween(store.state.network, a, b)).toMatchObject({ kind: "oneway", from: a });

    connectOrCycle(a, b, "oneway");
    expect(connectionBetween(store.state.network, a, b)).toMatchObject({ kind: "oneway", from: b });
  });

  it("reports removal once the cycle completes", () => {
    const a = addNode(0, 0, null, "oneway");
    const b = addNode(10, 0, null, "oneway");
    for (let i = 0; i < 5; i++) connectOrCycle(a, b, "oneway");

    expect(connectionBetween(store.state.network, a, b)).toBeNull();
    expect(store.state.statusMessage).toMatch(/removed/i);
  });
});

describe("grid route and midpoints", () => {
  it("inserts nodes at grid crossings", () => {
    const a = addNode(0, 0, null, "oneway");
    const b = addNode(10, 0, null, "oneway");

    gridRoute(a, b);

    expect(store.state.network.waypoints.size).toBe(6);
    expect(store.state.statusMessage).toContain("4 nodes inserted");
  });

  it("selects the inserted midpoint and reports unconnected pairs", () => {
    const a = addNode(0, 0, null, "oneway");
    const b = addNode(10, 0, null, "oneway");

    insertMidpointBetween(a, b);
    expect(store.state.statusMessage).toMatch(/not connected/);

    connectOrCycle(a, b, "oneway");
    insertMidpointBetween(a, b);
    expect(store.state.selection.size).toBe(1);
  });
});

describe("selection", () => {
  it("selects, toggles and clears", () => {
    const a = addNode(0, 0, null, "oneway");
    addNode(10, 0, null, "oneway");

    selectAll();
    expect(store.state.selection.size).toBe(2);

    toggleSelection(a);
    expect(store.state.selection.has(a)).toBe(false);

    setSelection([a], "one node");
    expect(store.state.selection).toEqual(new Set([a]));
    expect(store.state.statusMessage).toBe("one node");
  });

  it("applies flags to the whole selection", () => {
    addNode(0, 0, null, "oneway");
    addNode(10, 0, null, "oneway");
    selectAll();

    setSelectionFlag(FLAG_SUBPRIO, true);
    expect([...store.state.network.waypoints.values()].every((wp) => wp.flags === FLAG_SUBPRIO)).toBe(true);

    setSelectionFlag(FLAG_SUBPRIO, false);
    expect([...store.state.network.waypoints.values()].every((wp) => wp.flags === 0)).toBe(true);
  });

  it("deletes the selection and does nothing when empty", () => {
    addNode(0, 0, null, "oneway");
    selectAll();
    deleteSelection();
    expect(store.state.network.waypoints.size).toBe(0);

    const version = store.getVersion();
    deleteSelection();
    expect(store.getVersion()).toBe(version);
  });

  it("spaces a chain evenly and rejects a branched selection", () => {
    const a = addNode(0, 0, null, "oneway");
    const b = addNode(1, 0, a, "oneway");
    const c = addNode(20, 0, b, "oneway");

    spaceSelectionEvenly([a, b, c]);
    expect(store.state.network.waypoints.get(b)!.x).toBeCloseTo(10);

    spaceSelectionEvenly([a]);
    expect(store.state.statusMessage).toMatch(/not a single unbranched path/);
  });
});

describe("move commits", () => {
  it("collapses a drag into one undoable step", () => {
    const a = addNode(0, 0, null, "oneway");
    const origins = new Map([[a, { x: 0, z: 0 }]]);
    const finals = new Map([[a, { x: 40, z: 20 }]]);

    commitMove(origins, finals);
    expect(store.state.network.waypoints.get(a)).toMatchObject({ x: 40, z: 20 });

    store.undo();
    expect(store.state.network.waypoints.get(a)).toMatchObject({ x: 0, z: 0 });
  });
});

describe("blueprint placement", () => {
  it("stamps the pending blueprint at the given position", () => {
    addNode(0, 0, null, "oneway");
    addNode(10, 0, null, "oneway");
    selectAll();
    const blueprint = captureBlueprint(store.state.network, store.state.selection, "pair")!;
    store.update((s) => (s.placement = { blueprint, rotation: 0 }));

    stampBlueprintAt(100, 100);

    expect(store.state.network.waypoints.size).toBe(4);
    expect(store.state.selection.size).toBe(2);
  });

  it("does nothing without a pending placement", () => {
    const version = store.getVersion();
    stampBlueprintAt(0, 0);
    expect(store.getVersion()).toBe(version);
  });
});

describe("cancelCurrentInteraction", () => {
  it("backs out of placement, then pending connection, then selection", () => {
    const a = addNode(0, 0, null, "oneway");
    store.update((s) => {
      s.placement = { blueprint: captureBlueprint(s.network, new Set([a]), "x")!, rotation: 0 };
      s.pendingConnectFrom = a;
      s.selection = new Set([a]);
      s.tool = "place";
    });

    cancelCurrentInteraction();
    expect(store.state.placement).toBeNull();
    expect(store.state.tool).toBe("select");

    cancelCurrentInteraction();
    expect(store.state.pendingConnectFrom).toBeNull();

    cancelCurrentInteraction();
    expect(store.state.selection.size).toBe(0);
  });
});

describe("grid alignment", () => {
  it("shifts the grid so its lines cross the waypoint", () => {
    const id = addNode(123.4, -57.9, null, "oneway");
    store.update((s) => (s.settings.gridSize = 2));

    alignGridToWaypoint(id);

    const waypoint = store.state.network.waypoints.get(id)!;
    expect(store.snapX(waypoint.x)).toBeCloseTo(waypoint.x);
    expect(store.snapZ(waypoint.z)).toBeCloseTo(waypoint.z);
    expect(store.state.statusMessage).toContain("aligned");
  });

  it("ignores an unknown waypoint and resets on request", () => {
    store.update((s) => {
      s.settings.gridOffsetX = 1.5;
      s.settings.gridOffsetZ = 0.5;
    });

    alignGridToWaypoint(999);
    expect(store.state.settings.gridOffsetX).toBe(1.5);

    resetGridOffset();
    expect(store.state.settings.gridOffsetX).toBe(0);
    expect(store.state.settings.gridOffsetZ).toBe(0);
  });
});

describe("focusOnWaypoint", () => {
  it("centers the view and selects, ignoring unknown ids", () => {
    const a = addNode(50, 0, null, "oneway");
    store.update((s) => (s.view = { cx: 0, cz: 0, scale: 1 }));

    focusOnWaypoint(a);
    expect(store.state.view).toMatchObject({ cx: 50, scale: 3 });
    expect(store.state.selection).toEqual(new Set([a]));

    focusOnWaypoint(999);
    expect(store.state.view.cx).toBe(50);
  });
});

describe("disconnectNodes", () => {
  it("removes an existing link", () => {
    const a = addNode(0, 0, null, "oneway");
    const b = addNode(10, 0, a, "dual");

    disconnectNodes(a, b);
    expect(connectionBetween(store.state.network, a, b)).toBeNull();
  });
});

describe("mergeStackedNodes", () => {
  it("folds nodes sharing a spot into one and selects what is left", () => {
    const a = addNode(0, 0, null, "oneway");
    const b = addNode(10, 0, a, "oneway");
    // a second node dropped on b, linked onwards
    const dupe = addNode(10, 0, null, "oneway");
    const c = addNode(20, 0, dupe, "oneway");

    mergeStackedNodes();

    expect(store.state.network.waypoints.has(dupe)).toBe(false);
    expect(connectionBetween(store.state.network, a, b)).not.toBeNull();
    expect(connectionBetween(store.state.network, b, c)).not.toBeNull();
    expect(store.state.selection).toEqual(new Set([b]));
    expect(store.state.statusMessage).toMatch(/Merged 1 stacked node/);
  });

  it("is undoable in one step", () => {
    addNode(0, 0, null, "oneway");
    addNode(0, 0, null, "oneway");

    mergeStackedNodes();
    expect(store.state.network.waypoints.size).toBe(1);

    store.undo();
    expect(store.state.network.waypoints.size).toBe(2);
  });

  it("says so and changes nothing when no nodes are stacked", () => {
    addNode(0, 0, null, "oneway");
    const version = store.getVersion();

    mergeStackedNodes();

    expect(store.state.statusMessage).toBe("No stacked nodes found");
    expect(store.getVersion()).toBe(version + 1);
    expect(store.state.network.waypoints.size).toBe(1);
  });
});
