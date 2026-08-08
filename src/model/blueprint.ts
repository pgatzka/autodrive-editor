import { connect } from "./graph";
import { Blueprint, emptyNetwork, RouteNetwork, Waypoint } from "./types";

/**
 * Capture the selected nodes (and the connections among them) as a reusable
 * blueprint.
 *
 * Node coordinates are stored relative to an anchor — the point that lands
 * under the cursor when the blueprint is stamped. Capturing from the map has
 * no meaningful origin, so the anchor defaults to the centroid; the blueprint
 * workspace passes its own fixed origin so the anchor never drifts as nodes
 * are added.
 */
export function captureBlueprint(
  net: RouteNetwork,
  ids: Set<number>,
  name: string,
  anchor?: { x: number; z: number }
): Blueprint | null {
  const nodes = Array.from(ids)
    .map((id) => net.waypoints.get(id))
    .filter((wp): wp is Waypoint => wp !== undefined)
    .sort((a, b) => a.id - b.id);
  if (nodes.length === 0) return null;

  const origin = captureOrigin(nodes, anchor);
  const indexOf = new Map(nodes.map((node, index) => [node.id, index]));

  return {
    format: "autodrive-editor-blueprint",
    version: 1,
    name,
    nodes: nodes.map((n) => ({
      x: round3(n.x - origin.x),
      y: round3(n.y - origin.y),
      z: round3(n.z - origin.z),
      flags: n.flags,
    })),
    edges: captureEdges(net, nodes, indexOf),
    markers: net.markers
      .filter((marker) => indexOf.has(marker.wpId))
      .map((marker) => ({ node: indexOf.get(marker.wpId)!, name: marker.name, group: marker.group })),
  };
}

/**
 * Heights always stay relative to the mean, since stamping re-bases them on
 * the terrain; only the horizontal anchor is caller-controlled.
 */
function captureOrigin(
  nodes: Waypoint[],
  anchor?: { x: number; z: number }
): { x: number; y: number; z: number } {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const node of nodes) {
    cx += node.x;
    cy += node.y;
    cz += node.z;
  }
  return {
    x: anchor ? anchor.x : cx / nodes.length,
    y: cy / nodes.length,
    z: anchor ? anchor.z : cz / nodes.length,
  };
}

/** Connections among the captured nodes, dual links emitted once. */
function captureEdges(
  net: RouteNetwork,
  nodes: Waypoint[],
  indexOf: Map<number, number>
): Blueprint["edges"] {
  const edges: Blueprint["edges"] = [];
  for (const node of nodes) {
    for (const toId of node.out) {
      if (!indexOf.has(toId)) continue;
      const to = net.waypoints.get(toId)!;
      const dual = to.out.includes(node.id);
      if (dual && toId < node.id) continue;
      edges.push({
        from: indexOf.get(node.id)!,
        to: indexOf.get(toId)!,
        kind: dual ? "dual" : to.incoming.includes(node.id) ? "oneway" : "reverse",
      });
    }
  }
  return edges;
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

/** Structural check for blueprints arriving from disk or another install. */
export function isBlueprint(value: unknown): value is Blueprint {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.format === "autodrive-editor-blueprint" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    Array.isArray(candidate.markers)
  );
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
