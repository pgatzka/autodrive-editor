import { beforeEach, describe, expect, it } from "vitest";
import {
  addWaypoint,
  allEdges,
  connect,
  connectAcrossGrid,
  connectionBetween,
  cycleConnection,
  deleteWaypoints,
  disconnect,
  estimateY,
  evenlySpaceChain,
  insertMidpoint,
  orderAsChain,
  setFlagOn,
  smoothCurve,
} from "./graph";
import { Grid } from "./grid";
import { emptyNetwork, FLAG_SUBPRIO, RouteNetwork } from "./types";

let net: RouteNetwork;

/** A grid aligned to the origin, unless a test says otherwise. */
function grid(size: number, offsetX = 0, offsetZ = 0): Grid {
  return { size, offsetX, offsetZ, majorEvery: 10 };
}

/** Chain of nodes along the x axis at 10 m spacing. */
function addRow(count: number, spacing = 10): number[] {
  return Array.from({ length: count }, (_, i) => addWaypoint(net, i * spacing, 0, 0).id);
}

beforeEach(() => {
  net = emptyNetwork();
});

describe("connections", () => {
  it("encodes one-way, two-way and reverse links", () => {
    const [a, b] = addRow(2);

    connect(net, a, b, "oneway");
    expect(net.waypoints.get(a)!.out).toEqual([b]);
    expect(net.waypoints.get(b)!.incoming).toEqual([a]);
    expect(connectionBetween(net, a, b)).toMatchObject({ kind: "oneway" });

    connect(net, a, b, "dual");
    expect(connectionBetween(net, a, b)).toMatchObject({ kind: "dual" });

    connect(net, a, b, "reverse");
    expect(net.waypoints.get(b)!.incoming).toEqual([]);
    expect(connectionBetween(net, a, b)).toMatchObject({ kind: "reverse" });
  });

  it("ignores self-connections and unknown nodes", () => {
    const [a] = addRow(1);
    connect(net, a, a, "oneway");
    connect(net, a, 999, "oneway");
    expect(net.waypoints.get(a)!.out).toEqual([]);
    expect(connectionBetween(net, a, 999)).toBeNull();
  });

  it("cycles through every connection type and back to none", () => {
    const [a, b] = addRow(2);
    const kinds: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      cycleConnection(net, a, b);
      const edge = connectionBetween(net, a, b);
      kinds.push(edge ? `${edge.kind}:${edge.from}` : null);
    }
    expect(kinds).toEqual([`oneway:${a}`, `oneway:${b}`, `dual:${a}`, `reverse:${a}`, null]);
  });

  it("removes links in both directions on disconnect", () => {
    const [a, b] = addRow(2);
    connect(net, a, b, "dual");
    disconnect(net, a, b);
    expect(connectionBetween(net, a, b)).toBeNull();
  });

  it("emits each dual edge once", () => {
    const [a, b, c] = addRow(3);
    connect(net, a, b, "dual");
    connect(net, b, c, "oneway");
    expect(allEdges(net)).toHaveLength(2);
  });
});

describe("deleteWaypoints", () => {
  it("removes nodes with their references and markers", () => {
    const [a, b, c] = addRow(3);
    connect(net, a, b, "dual");
    connect(net, b, c, "oneway");
    net.markers.push({ wpId: b, name: "gone", group: "All" });

    deleteWaypoints(net, [b]);

    expect(net.waypoints.has(b)).toBe(false);
    expect(net.waypoints.get(a)!.out).toEqual([]);
    expect(net.waypoints.get(c)!.incoming).toEqual([]);
    expect(net.markers).toEqual([]);
  });
});

describe("connectAcrossGrid", () => {
  it("creates a node at every grid crossing and chains them", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 10, 0, 0).id;

    const created = connectAcrossGrid(net, a, b, grid(2), "oneway");

    expect(created.map((id) => net.waypoints.get(id)!.x)).toEqual([2, 4, 6, 8]);
    let current = a;
    for (const id of [...created, b]) {
      expect(net.waypoints.get(current)!.out).toContain(id);
      current = id;
    }
  });

  it("merges crossings that coincide on a diagonal", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 10, 0, 10).id;
    expect(connectAcrossGrid(net, a, b, grid(2), "dual")).toHaveLength(4);
  });

  it("replaces an existing direct link", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 10, 0, 0).id;
    connect(net, a, b, "oneway");

    connectAcrossGrid(net, a, b, grid(2), "oneway");

    expect(net.waypoints.get(a)!.out).not.toContain(b);
  });

  it("interpolates height along the route", () => {
    const a = addWaypoint(net, 0, 100, 0).id;
    const b = addWaypoint(net, 10, 110, 0).id;
    const created = connectAcrossGrid(net, a, b, grid(5), "oneway");
    expect(net.waypoints.get(created[0])!.y).toBeCloseTo(105);
  });

  it("puts the crossings on the offset grid", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 10, 0, 0).id;

    // lines at 1.5, 3.5, 5.5, ... rather than 2, 4, 6
    const created = connectAcrossGrid(net, a, b, grid(2, 1.5), "oneway");

    expect(created.map((id) => net.waypoints.get(id)!.x)).toEqual([1.5, 3.5, 5.5, 7.5, 9.5]);
  });

  it("does nothing for degenerate input", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    expect(connectAcrossGrid(net, a, a, grid(2), "oneway")).toEqual([]);
    expect(connectAcrossGrid(net, a, 999, grid(2), "oneway")).toEqual([]);
    expect(connectAcrossGrid(net, a, a, grid(0), "oneway")).toEqual([]);
  });
});

describe("route tools", () => {
  it("inserts a midpoint preserving direction and kind", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 10, 0, 0).id;
    connect(net, a, b, "reverse");

    const mid = insertMidpoint(net, a, b)!;

    expect(net.waypoints.get(mid)).toMatchObject({ x: 5 });
    expect(connectionBetween(net, a, mid)).toMatchObject({ kind: "reverse" });
    expect(connectionBetween(net, mid, b)).toMatchObject({ kind: "reverse" });
    expect(connectionBetween(net, a, b)).toBeNull();
  });

  it("returns null when inserting into a missing connection", () => {
    const [a, b] = addRow(2);
    expect(insertMidpoint(net, a, b)).toBeNull();
  });

  it("orders a selection into a chain and spaces it evenly", () => {
    const ids = addRow(3);
    connect(net, ids[0], ids[1], "oneway");
    connect(net, ids[1], ids[2], "oneway");
    net.waypoints.get(ids[1])!.x = 1; // bunched up near the start

    const chain = orderAsChain(net, new Set(ids))!;
    expect(chain).toEqual(ids);

    evenlySpaceChain(net, chain);
    expect(net.waypoints.get(ids[1])!.x).toBeCloseTo(10);
  });

  it("refuses to order branched or disconnected selections", () => {
    const ids = addRow(4);
    connect(net, ids[0], ids[1], "oneway");
    connect(net, ids[1], ids[2], "oneway");
    connect(net, ids[1], ids[3], "oneway"); // branch
    expect(orderAsChain(net, new Set(ids))).toBeNull();
    expect(orderAsChain(net, new Set([ids[0]]))).toBeNull();
  });

  it("builds a curve of the requested segment count", () => {
    const a = addWaypoint(net, 0, 100, 0).id;
    const b = addWaypoint(net, 100, 100, 0).id;

    const created = smoothCurve(net, a, b, 6, "oneway");

    expect(created).toHaveLength(5);
    expect(connectionBetween(net, a, created[0])).toMatchObject({ kind: "oneway" });
    expect(connectionBetween(net, created.at(-1)!, b)).toMatchObject({ kind: "oneway" });
  });

  it("bends the curve toward an existing neighbor direction", () => {
    const approach = addWaypoint(net, 0, 0, -50).id;
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 100, 0, 100).id;
    connect(net, approach, a, "oneway");

    const created = smoothCurve(net, a, b, 4, "oneway");

    // leaving `a` the curve keeps heading along +z before turning toward b
    expect(net.waypoints.get(created[0])!.z).toBeGreaterThan(net.waypoints.get(created[0])!.x);
  });

  it("does nothing for degenerate curve input", () => {
    const [a] = addRow(1);
    expect(smoothCurve(net, a, 999, 4, "oneway")).toEqual([]);
    expect(smoothCurve(net, a, a, 1, "oneway")).toEqual([]);
  });
});

describe("flags and heights", () => {
  it("sets and clears flags on a selection", () => {
    const ids = addRow(2);
    setFlagOn(net, ids, FLAG_SUBPRIO, true);
    expect(net.waypoints.get(ids[0])!.flags).toBe(FLAG_SUBPRIO);

    setFlagOn(net, ids, FLAG_SUBPRIO, false);
    expect(net.waypoints.get(ids[0])!.flags).toBe(0);
  });

  it("estimates height from the nearest node, defaulting to zero when empty", () => {
    expect(estimateY(net, 0, 0)).toBe(0);
    addWaypoint(net, 0, 42, 0);
    addWaypoint(net, 100, 7, 0);
    expect(estimateY(net, 10, 0)).toBe(42);
  });
});
