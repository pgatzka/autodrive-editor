import { beforeEach, describe, expect, it } from "vitest";
import { addWaypoint, connect, connectionBetween, findStackedGroups, mergeStacked } from "./graph";
import { emptyNetwork, FLAG_SUBPRIO, FLAG_TRAFFIC_SYSTEM, RouteNetwork } from "./types";

let net: RouteNetwork;

beforeEach(() => {
  net = emptyNetwork();
});

/** Merge every stack in the network, the way the button does. */
function mergeAll() {
  return mergeStacked(net, findStackedGroups(net));
}

describe("findStackedGroups", () => {
  it("finds nodes sharing a spot and keeps the lowest id", () => {
    const a = addWaypoint(net, 10, 100, 20).id;
    const b = addWaypoint(net, 10, 100, 20).id;
    const c = addWaypoint(net, 10, 100, 20).id;
    addWaypoint(net, 11, 100, 20);

    expect(findStackedGroups(net)).toEqual([{ keepId: a, mergeIds: [b, c] }]);
  });

  it("ignores height, which only says how high the terrain is", () => {
    addWaypoint(net, 10, 100, 20);
    addWaypoint(net, 10, 240, 20);

    expect(findStackedGroups(net)).toHaveLength(1);
  });

  it("separates nodes that are merely close", () => {
    addWaypoint(net, 10, 100, 20);
    addWaypoint(net, 10.0001, 100, 20);

    expect(findStackedGroups(net)).toEqual([]);
  });

  it("can be limited to a selection", () => {
    const a = addWaypoint(net, 0, 0, 0).id;
    addWaypoint(net, 0, 0, 0);
    const c = addWaypoint(net, 0, 0, 0).id;

    expect(findStackedGroups(net, [a, c])).toEqual([{ keepId: a, mergeIds: [c] }]);
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
    const keep = findStackedGroups(net)[0].keepId;

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
