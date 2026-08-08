import { connect } from "./graph";
import { Blueprint, emptyNetwork, RouteNetwork, Waypoint } from "./types";

/** Capture the selected nodes (and the connections among them) as a reusable blueprint. */
export function captureBlueprint(net: RouteNetwork, ids: Set<number>, name: string): Blueprint | null {
  const nodes: Waypoint[] = [];
  for (const id of ids) {
    const wp = net.waypoints.get(id);
    if (wp) nodes.push(wp);
  }
  if (nodes.length === 0) return null;
  nodes.sort((a, b) => a.id - b.id);

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const n of nodes) {
    cx += n.x;
    cy += n.y;
    cz += n.z;
  }
  cx /= nodes.length;
  cy /= nodes.length;
  cz /= nodes.length;

  const indexOf = new Map<number, number>();
  nodes.forEach((n, i) => indexOf.set(n.id, i));

  const bp: Blueprint = {
    format: "autodrive-editor-blueprint",
    version: 1,
    name,
    nodes: nodes.map((n) => ({
      x: round3(n.x - cx),
      y: round3(n.y - cy),
      z: round3(n.z - cz),
      flags: n.flags,
    })),
    edges: [],
    markers: [],
  };

  for (const n of nodes) {
    for (const toId of n.out) {
      if (!indexOf.has(toId)) continue;
      const to = net.waypoints.get(toId)!;
      const dual = to.out.includes(n.id);
      if (dual && toId < n.id) continue;
      bp.edges.push({
        from: indexOf.get(n.id)!,
        to: indexOf.get(toId)!,
        kind: dual ? "dual" : to.incoming.includes(n.id) ? "oneway" : "reverse",
      });
    }
  }

  for (const m of net.markers) {
    if (indexOf.has(m.wpId)) {
      bp.markers.push({ node: indexOf.get(m.wpId)!, name: m.name, group: m.group });
    }
  }

  return bp;
}

export interface Placement {
  x: number;
  z: number;
  /** rotation around the vertical axis, radians */
  rotation: number;
}

/** Blueprint node positions under a placement, for ghost preview and committing. */
export function placedPositions(bp: Blueprint, p: Placement): { x: number; z: number }[] {
  const cos = Math.cos(p.rotation);
  const sin = Math.sin(p.rotation);
  return bp.nodes.map((n) => ({
    x: p.x + n.x * cos - n.z * sin,
    z: p.z + n.x * sin + n.z * cos,
  }));
}

/** Instantiate the blueprint into the network. Returns the new waypoint ids. */
export function stampBlueprint(net: RouteNetwork, bp: Blueprint, p: Placement, baseY: number): number[] {
  const positions = placedPositions(bp, p);
  const ids: number[] = [];
  positions.forEach((pos, i) => {
    const wp: Waypoint = {
      id: net.nextId++,
      x: pos.x,
      y: baseY + bp.nodes[i].y,
      z: pos.z,
      out: [],
      incoming: [],
      flags: bp.nodes[i].flags,
    };
    net.waypoints.set(wp.id, wp);
    ids.push(wp.id);
  });
  for (const e of bp.edges) {
    connect(net, ids[e.from], ids[e.to], e.kind);
  }
  const usedNames = new Set(net.markers.map((m) => m.name));
  for (const m of bp.markers) {
    let name = m.name;
    let i = 2;
    while (usedNames.has(name)) name = `${m.name} ${i++}`;
    usedNames.add(name);
    net.markers.push({ wpId: ids[m.node], name, group: m.group });
    if (!net.groups.includes(m.group)) net.groups.push(m.group);
  }
  return ids;
}

/**
 * Expand a blueprint into a standalone network for the blueprint editor,
 * centered on the origin. captureBlueprint() of all its nodes round-trips.
 */
export function blueprintToNetwork(bp: Blueprint): RouteNetwork {
  const net = emptyNetwork();
  const ids: number[] = [];
  for (const n of bp.nodes) {
    const wp: Waypoint = { id: net.nextId++, x: n.x, y: n.y, z: n.z, out: [], incoming: [], flags: n.flags };
    net.waypoints.set(wp.id, wp);
    ids.push(wp.id);
  }
  for (const e of bp.edges) connect(net, ids[e.from], ids[e.to], e.kind);
  for (const m of bp.markers) {
    net.markers.push({ wpId: ids[m.node], name: m.name, group: m.group });
    if (!net.groups.includes(m.group)) net.groups.push(m.group);
  }
  return net;
}

export function isBlueprint(v: unknown): v is Blueprint {
  const b = v as Blueprint;
  return (
    !!b &&
    b.format === "autodrive-editor-blueprint" &&
    Array.isArray(b.nodes) &&
    Array.isArray(b.edges) &&
    Array.isArray(b.markers) &&
    typeof b.name === "string"
  );
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
