import { beforeEach, describe, expect, it } from "vitest";
import {
  blueprintToNetwork,
  captureBlueprint,
  isBlueprint,
  placedPositions,
  stampBlueprint,
} from "./blueprint";
import { addWaypoint, connect } from "./graph";
import { emptyNetwork, FLAG_SUBPRIO, RouteNetwork } from "./types";

let net: RouteNetwork;
let ids: number[];

beforeEach(() => {
  net = emptyNetwork();
  // an L shape: (-10,0) -> (0,0) -> (0,10)
  ids = [addWaypoint(net, -10, 100, 0).id, addWaypoint(net, 0, 100, 0).id, addWaypoint(net, 0, 100, 10).id];
  connect(net, ids[0], ids[1], "oneway");
  connect(net, ids[1], ids[2], "dual");
  net.waypoints.get(ids[2])!.flags = FLAG_SUBPRIO;
  net.markers.push({ wpId: ids[2], name: "Silo", group: "Farm" });
});

describe("captureBlueprint", () => {
  it("stores nodes relative to the centroid with edges and markers", () => {
    const blueprint = captureBlueprint(net, new Set(ids), "L shape")!;

    expect(blueprint.nodes).toHaveLength(3);
    expect(blueprint.edges).toHaveLength(2);
    expect(blueprint.markers).toEqual([{ node: 2, name: "Silo", group: "Farm" }]);
    // centroid is at (-3.333, 3.333); coordinates are relative to it
    const centroidX = blueprint.nodes.reduce((sum, node) => sum + node.x, 0) / 3;
    expect(centroidX).toBeCloseTo(0);
    expect(blueprint.nodes[2].flags).toBe(FLAG_SUBPRIO);
  });

  it("keeps only connections between captured nodes", () => {
    const blueprint = captureBlueprint(net, new Set([ids[0], ids[1]]), "partial")!;
    expect(blueprint.edges).toEqual([{ from: 0, to: 1, kind: "oneway" }]);
    expect(blueprint.markers).toEqual([]);
  });

  it("uses a caller-supplied anchor instead of the centroid when given one", () => {
    const blueprint = captureBlueprint(net, new Set(ids), "L shape", { x: 0, z: 0 })!;

    // coordinates are now relative to the origin, not to the selection's centre
    expect(blueprint.nodes[0]).toMatchObject({ x: -10, z: 0 });
    expect(blueprint.nodes[2]).toMatchObject({ x: 0, z: 10 });
  });

  it("returns null for an empty selection", () => {
    expect(captureBlueprint(net, new Set(), "nothing")).toBeNull();
  });
});

describe("stampBlueprint", () => {
  it("recreates nodes, edges and flags at the placement", () => {
    const blueprint = captureBlueprint(net, new Set(ids), "L shape")!;
    const target = emptyNetwork();

    const stamped = stampBlueprint(target, blueprint, { x: 100, z: 100, rotation: 0 }, 50);

    expect(target.waypoints.size).toBe(3);
    expect(target.waypoints.get(stamped[0])!.out).toContain(stamped[1]);
    expect(target.waypoints.get(stamped[2])!.flags).toBe(FLAG_SUBPRIO);
    // heights are relative to the sampled base height
    expect(target.waypoints.get(stamped[0])!.y).toBeCloseTo(50);
  });

  it("rotates around the anchor", () => {
    const blueprint = captureBlueprint(net, new Set(ids), "L shape")!;
    const target = emptyNetwork();

    const stamped = stampBlueprint(target, blueprint, { x: 0, z: 0, rotation: Math.PI / 2 }, 0);

    const first = target.waypoints.get(stamped[0])!;
    // a quarter turn maps offset (x, z) to (-z, x)
    expect(first.x).toBeCloseTo(-blueprint.nodes[0].z);
    expect(first.z).toBeCloseTo(blueprint.nodes[0].x);
  });

  it("makes stamped marker names unique", () => {
    const blueprint = captureBlueprint(net, new Set(ids), "L shape")!;
    const target = emptyNetwork();

    stampBlueprint(target, blueprint, { x: 0, z: 0, rotation: 0 }, 0);
    stampBlueprint(target, blueprint, { x: 50, z: 0, rotation: 0 }, 0);

    expect(target.markers.map((marker) => marker.name)).toEqual(["Silo", "Silo 2"]);
    expect(target.groups).toContain("Farm");
  });
});

describe("blueprintToNetwork", () => {
  it("round-trips through the blueprint editor unchanged", () => {
    const blueprint = captureBlueprint(net, new Set(ids), "L shape")!;

    const editable = blueprintToNetwork(blueprint);
    const recaptured = captureBlueprint(editable, new Set(editable.waypoints.keys()), blueprint.name)!;

    expect(recaptured).toEqual(blueprint);
  });
});

describe("placedPositions", () => {
  it("is unaffected by rotation at the anchor", () => {
    const blueprint = captureBlueprint(net, new Set(ids), "L shape")!;
    const positions = placedPositions(blueprint, { x: 5, z: 5, rotation: Math.PI });
    const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
    expect(centerX).toBeCloseTo(5);
  });
});

describe("isBlueprint", () => {
  it("accepts a captured blueprint and rejects anything else", () => {
    expect(isBlueprint(captureBlueprint(net, new Set(ids), "x"))).toBe(true);
    expect(isBlueprint({ name: "x" })).toBe(false);
    expect(isBlueprint(null)).toBe(false);
  });
});
