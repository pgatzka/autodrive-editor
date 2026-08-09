import { beforeEach, describe, expect, it } from "vitest";
import { addWaypoint, connect, connectAcrossGrid, connectionBetween } from "./graph";
import { DEFAULT_STACK_TOLERANCE_M, findStackedGroups, mergeStacked } from "./stacked";
import { emptyNetwork, FLAG_SUBPRIO, FLAG_TRAFFIC_SYSTEM, RouteNetwork } from "./types";

let net: RouteNetwork;

beforeEach(() => {
  net = emptyNetwork();
});

/** Merge every stack in the network, the way the button does. */
function mergeAll(tolerance = 0) {
  return mergeStacked(net, findStackedGroups(net, tolerance));
}

describe("findStackedGroups", () => {
  it("finds nodes sharing a spot and keeps the lowest id", () => {
    const a = addWaypoint(net, 10, 100, 20).id;
    const b = addWaypoint(net, 10, 100, 20).id;
    const c = addWaypoint(net, 10, 100, 20).id;
    addWaypoint(net, 11, 100, 20);

    expect(findStackedGroups(net, 0)).toEqual([{ keepId: a, mergeIds: [b, c] }]);
  });

  it("ignores height, which only says how high the terrain is", () => {
    addWaypoint(net, 10, 100, 20);
    addWaypoint(net, 10, 240, 20);

    expect(findStackedGroups(net, 0)).toHaveLength(1);
  });

  it("separates nodes that are merely close", () => {
    addWaypoint(net, 10, 100, 20);
    addWaypoint(net, 10.0001, 100, 20);

    expect(findStackedGroups(net, 0)).toEqual([]);
  });

  it("can be limited to a selection", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    addWaypoint(net, 0, 0, 0);
    const c = addWaypoint(net, 0, 0, 0).id;

    expect(findStackedGroups(net, 0, [a, c])).toEqual([{ keepId: a, mergeIds: [c] }]);
  });
});

describe("mergeStacked", () => {
  it("does nothing when there is nothing stacked", () => {
    addWaypoint(net, 0, 0, 0);

    expect(mergeAll()).toEqual({ groups: 0, nodes: 0, connections: 0, markers: 0 });
    expect(net.waypoints.size).toBe(1);
  });

  it("keeps the connections of both nodes", () => {
    const west = addWaypoint(net, -10, 0, 0).id;
    const east = addWaypoint(net, 10, 0, 0).id;
    const keep = addWaypoint(net, 0, 0, 0).id;
    const dupe = addWaypoint(net, 0, 0, 0).id;
    connect(net, west, keep, "oneway");
    connect(net, dupe, east, "oneway");

    const result = mergeAll();

    expect(net.waypoints.has(dupe)).toBe(false);
    expect(result).toMatchObject({ groups: 1, nodes: 1 });
    expect(connectionBetween(net, west, keep)).toEqual({ from: west, to: keep, kind: "oneway" });
    expect(connectionBetween(net, keep, east)).toEqual({ from: keep, to: east, kind: "oneway" });
  });

  it("turns two opposite one-ways into a two-way link", () => {
    const other = addWaypoint(net, 10, 0, 0).id;
    const keep = addWaypoint(net, 0, 0, 0).id;
    const dupe = addWaypoint(net, 0, 0, 0).id;
    connect(net, keep, other, "oneway");
    connect(net, other, dupe, "oneway");

    mergeAll();

    expect(connectionBetween(net, keep, other)).toEqual({ from: keep, to: other, kind: "dual" });
  });

  it("drops the link between two nodes that were stacked on each other", () => {
    const keep = addWaypoint(net, 0, 0, 0).id;
    const dupe = addWaypoint(net, 0, 0, 0).id;
    connect(net, keep, dupe, "dual");

    const result = mergeAll();

    expect(net.waypoints.get(keep)!.out).toEqual([]);
    expect(net.waypoints.get(keep)!.incoming).toEqual([]);
    expect(result.connections).toBe(2);
  });

  it("counts a connection both nodes already had as one removed duplicate", () => {
    const other = addWaypoint(net, 10, 0, 0).id;
    const keep = addWaypoint(net, 0, 0, 0).id;
    const dupe = addWaypoint(net, 0, 0, 0).id;
    connect(net, keep, other, "oneway");
    connect(net, dupe, other, "oneway");

    const result = mergeAll();

    expect(result.connections).toBe(1);
    expect(net.waypoints.get(keep)!.out).toEqual([other]);
    expect(net.waypoints.get(other)!.incoming).toEqual([keep]);
  });

  it("keeps the flags of every node in the stack", () => {
    addWaypoint(net, 0, 0, 0, FLAG_SUBPRIO);
    addWaypoint(net, 0, 0, 0, FLAG_TRAFFIC_SYSTEM);
    const keep = findStackedGroups(net, 0)[0].keepId;

    mergeAll();

    expect(net.waypoints.get(keep)!.flags).toBe(FLAG_SUBPRIO | FLAG_TRAFFIC_SYSTEM);
  });

  it("moves a marker onto the node that stays", () => {
    const keep = addWaypoint(net, 0, 0, 0).id;
    const dupe = addWaypoint(net, 0, 0, 0).id;
    net.markers.push({ wpId: dupe, name: "Silo", group: "All" });

    const result = mergeAll();

    expect(net.markers).toEqual([{ wpId: keep, name: "Silo", group: "All" }]);
    expect(result.markers).toBe(0);
  });

  it("drops a marker that would land on a node that already has one", () => {
    const keep = addWaypoint(net, 0, 0, 0).id;
    const dupe = addWaypoint(net, 0, 0, 0).id;
    net.markers.push({ wpId: keep, name: "Silo", group: "All" });
    net.markers.push({ wpId: dupe, name: "Silo copy", group: "All" });

    const result = mergeAll();

    expect(net.markers).toEqual([{ wpId: keep, name: "Silo", group: "All" }]);
    expect(result.markers).toBe(1);
  });

  it("collapses a stack of three at once", () => {
    const keep = addWaypoint(net, 0, 0, 0).id;
    const second = addWaypoint(net, 0, 0, 0).id;
    const third = addWaypoint(net, 0, 0, 0).id;
    const north = addWaypoint(net, 0, 0, -10).id;
    const south = addWaypoint(net, 0, 0, 10).id;
    connect(net, north, second, "oneway");
    connect(net, third, south, "reverse");

    const result = mergeAll();

    expect(result).toMatchObject({ groups: 1, nodes: 2 });
    expect(net.waypoints.size).toBe(3);
    expect(connectionBetween(net, north, keep)).toEqual({ from: north, to: keep, kind: "oneway" });
    expect(connectionBetween(net, keep, south)).toEqual({ from: keep, to: south, kind: "reverse" });
  });

  it("handles several stacks in one pass", () => {
    addWaypoint(net, 0, 0, 0);
    addWaypoint(net, 0, 0, 0);
    addWaypoint(net, 50, 0, 0);
    addWaypoint(net, 50, 0, 0);
    addWaypoint(net, 50, 0, 0);

    expect(mergeAll()).toMatchObject({ groups: 2, nodes: 3 });
    expect(net.waypoints.size).toBe(2);
  });

  it("leaves no reference to a node it removed", () => {
    const keep = addWaypoint(net, 0, 0, 0).id;
    const dupe = addWaypoint(net, 0, 0, 0).id;
    const other = addWaypoint(net, 10, 0, 0).id;
    connect(net, other, dupe, "dual");

    mergeAll();

    const referenced = [...net.waypoints.values()].flatMap((wp) => [...wp.out, ...wp.incoming]);
    expect(referenced).not.toContain(dupe);
    expect(connectionBetween(net, other, keep)).toEqual({ from: other, to: keep, kind: "dual" });
  });
});

describe("finding stacks within a tolerance", () => {
  it("catches nodes that differ only in the last bits of a float", () => {
    // two grid routes crossing the same grid line compute it from different
    // endpoints and land a quadrillionth of a meter apart
    const a = addWaypoint(net, 6, 100, 0).id;
    const b = addWaypoint(net, 6.000000000000001, 100, 0).id;

    expect(findStackedGroups(net, 0)).toEqual([]);
    expect(findStackedGroups(net)).toEqual([{ keepId: a, mergeIds: [b] }]);
  });

  it("catches nodes a few centimeters apart", () => {
    const a = addWaypoint(net, 100, 0, 200).id;
    const b = addWaypoint(net, 100.04, 0, 200.03).id;

    expect(findStackedGroups(net, DEFAULT_STACK_TOLERANCE_M)).toEqual([{ keepId: a, mergeIds: [b] }]);
  });

  it("leaves nodes further apart than the tolerance alone", () => {
    addWaypoint(net, 0, 0, 0);
    addWaypoint(net, 0.2, 0, 0);

    expect(findStackedGroups(net, 0.1)).toEqual([]);
    expect(findStackedGroups(net, 0.25)).toHaveLength(1);
  });

  it("measures distance, not a square around the node", () => {
    addWaypoint(net, 0, 0, 0);
    // 0.09 on each axis is 0.127 away — outside a 0.1 m radius
    addWaypoint(net, 0.09, 0, 0.09);

    expect(findStackedGroups(net, 0.1)).toEqual([]);
  });

  it("finds stacks wherever they sit, not just near the origin", () => {
    const a = addWaypoint(net, -1943.7, 0, 872.55).id;
    const b = addWaypoint(net, -1943.72, 0, 872.56).id;

    expect(findStackedGroups(net)).toEqual([{ keepId: a, mergeIds: [b] }]);
  });

  it("joins a chain of near nodes into one stack", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 0.08, 0, 0).id;
    const c = addWaypoint(net, 0.16, 0, 0).id;

    // a and c are 0.16 apart, but each hop is within the tolerance
    expect(findStackedGroups(net, 0.1)).toEqual([{ keepId: a, mergeIds: [b, c] }]);
  });

  it("reports every stack in a network of many", () => {
    const spots = [
      [0, 0],
      [500, -500],
      [-1200.25, 900.75],
    ];
    for (const [x, z] of spots) {
      addWaypoint(net, x, 0, z);
      addWaypoint(net, x + 0.02, 0, z - 0.01);
      // plus a neighbour that must not be swallowed
      addWaypoint(net, x + 5, 0, z);
    }

    const groups = findStackedGroups(net);
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.mergeIds.length === 1)).toBe(true);
    expect(mergeStacked(net, groups)).toMatchObject({ groups: 3, nodes: 3 });
    expect(net.waypoints.size).toBe(6);
  });

  it("scales to a large network", () => {
    for (let i = 0; i < 5000; i++) addWaypoint(net, i * 3, 0, (i % 50) * 7);
    const target = addWaypoint(net, 0.03, 0, 0).id;

    const groups = findStackedGroups(net);

    expect(groups).toEqual([{ keepId: 1, mergeIds: [target] }]);
  });
});

describe("two grid routes crossing", () => {
  it("leaves a stack the exact comparison could not see", () => {
    const grid = { size: 2, offsetX: 0, offsetZ: 0, majorEvery: 10 };
    // west-east along z = 0, starting off the grid so the crossings are computed
    const west = addWaypoint(net, 0.3, 100, 0).id;
    const east = addWaypoint(net, 40.3, 100, 0).id;
    connectAcrossGrid(net, west, east, grid, "oneway");
    // north-south through x = 6, which the first route already has a node on
    const north = addWaypoint(net, 6, 100, -10).id;
    const south = addWaypoint(net, 6, 100, 10).id;
    connectAcrossGrid(net, north, south, grid, "oneway");

    const stacked = findStackedGroups(net);
    expect(stacked).toHaveLength(1);

    const [pair] = stacked;
    const kept = net.waypoints.get(pair.keepId)!;
    const dropped = net.waypoints.get(pair.mergeIds[0])!;
    expect(kept.x).not.toBe(dropped.x); // …which is why an exact match missed it
    expect(Math.abs(kept.x - dropped.x)).toBeLessThan(1e-9);
    expect(findStackedGroups(net, 0)).toEqual([]);

    // merging joins the two routes into one crossing
    mergeStacked(net, stacked);
    const crossing = net.waypoints.get(pair.keepId)!;
    expect(crossing.out.length + crossing.incoming.length).toBeGreaterThanOrEqual(4);
  });
});
