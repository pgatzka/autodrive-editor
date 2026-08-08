import { Grid } from "./grid";
import { ConnectionMode, Edge, MapMarker, RouteNetwork, Waypoint } from "./types";

function pushUnique(arr: number[], v: number) {
  if (!arr.includes(v)) arr.push(v);
}

function remove(arr: number[], v: number) {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
}

export function addWaypoint(net: RouteNetwork, x: number, y: number, z: number, flags = 0): Waypoint {
  const wp: Waypoint = { id: net.nextId++, x, y, z, out: [], incoming: [], flags };
  net.waypoints.set(wp.id, wp);
  return wp;
}

export interface DeletionImpact {
  /** waypoints that would be removed */
  nodes: number;
  /** connections removed, counted once per pair */
  connections: number;
  /** of those, links reaching a waypoint that survives */
  externalLinks: number;
  /** names of markers that would go with the nodes */
  markers: string[];
}

/**
 * What deleting a selection would take with it. Used to state collateral
 * damage before the user commits — links leaving the selection and markers
 * riding along are the parts they cannot see.
 */
export function deletionImpact(net: RouteNetwork, ids: Iterable<number>): DeletionImpact {
  const doomed = new Set(ids);
  const pairs = new Set<string>();
  const externalPairs = new Set<string>();

  for (const id of doomed) {
    const waypoint = net.waypoints.get(id);
    if (!waypoint) continue;
    const neighbours = new Set([...waypoint.out, ...waypoint.incoming]);
    for (const other of net.waypoints.values()) {
      if (other.out.includes(id)) neighbours.add(other.id);
    }
    for (const neighbour of neighbours) {
      if (neighbour === id || !net.waypoints.has(neighbour)) continue;
      const key = id < neighbour ? `${id}-${neighbour}` : `${neighbour}-${id}`;
      pairs.add(key);
      if (!doomed.has(neighbour)) externalPairs.add(key);
    }
  }

  return {
    nodes: Array.from(doomed).filter((id) => net.waypoints.has(id)).length,
    connections: pairs.size,
    externalLinks: externalPairs.size,
    markers: net.markers.filter((marker) => doomed.has(marker.wpId)).map((marker) => marker.name),
  };
}

export function deleteWaypoints(net: RouteNetwork, ids: Iterable<number>) {
  const doomed = new Set(ids);
  for (const id of doomed) net.waypoints.delete(id);
  for (const wp of net.waypoints.values()) {
    wp.out = wp.out.filter((t) => !doomed.has(t));
    wp.incoming = wp.incoming.filter((t) => !doomed.has(t));
  }
  net.markers = net.markers.filter((m) => !doomed.has(m.wpId));
}

/** Remove every link between a and b in both directions. */
export function disconnect(net: RouteNetwork, aId: number, bId: number) {
  const a = net.waypoints.get(aId);
  const b = net.waypoints.get(bId);
  if (!a || !b) return;
  remove(a.out, bId);
  remove(a.incoming, bId);
  remove(b.out, aId);
  remove(b.incoming, aId);
}

/**
 * Connect a -> b.
 *  oneway:  b in a.out, a in b.incoming
 *  dual:    additionally a in b.out, b in a.incoming
 *  reverse: b in a.out only (the vehicle backs up along this link)
 */
export function connect(net: RouteNetwork, aId: number, bId: number, mode: ConnectionMode) {
  if (aId === bId) return;
  const a = net.waypoints.get(aId);
  const b = net.waypoints.get(bId);
  if (!a || !b) return;
  disconnect(net, aId, bId);
  pushUnique(a.out, bId);
  if (mode === "oneway" || mode === "dual") pushUnique(b.incoming, aId);
  if (mode === "dual") {
    pushUnique(b.out, aId);
    pushUnique(a.incoming, bId);
  }
}

export function connectionBetween(net: RouteNetwork, aId: number, bId: number): Edge | null {
  const a = net.waypoints.get(aId);
  const b = net.waypoints.get(bId);
  if (!a || !b) return null;
  const aOutB = a.out.includes(bId);
  const bOutA = b.out.includes(aId);
  if (aOutB && bOutA) return { from: aId, to: bId, kind: "dual" };
  if (aOutB) return { from: aId, to: bId, kind: b.incoming.includes(aId) ? "oneway" : "reverse" };
  if (bOutA) return { from: bId, to: aId, kind: a.incoming.includes(bId) ? "oneway" : "reverse" };
  return null;
}

/**
 * Cycle a pair through the same sequence the in-game editor uses:
 * none -> oneway(a->b) -> oneway(b->a) -> dual -> reverse(a->b) -> none
 */
export function cycleConnection(net: RouteNetwork, aId: number, bId: number) {
  const current = connectionBetween(net, aId, bId);
  if (!current) return connect(net, aId, bId, "oneway");
  if (current.kind === "oneway" && current.from === aId) return connect(net, bId, aId, "oneway");
  if (current.kind === "oneway") return connect(net, aId, bId, "dual");
  if (current.kind === "dual") return connect(net, aId, bId, "reverse");
  return disconnect(net, aId, bId);
}

/** All edges, dual edges emitted once. */
export function allEdges(net: RouteNetwork): Edge[] {
  const edges: Edge[] = [];
  for (const wp of net.waypoints.values()) {
    for (const toId of wp.out) {
      const to = net.waypoints.get(toId);
      if (!to) continue;
      const dual = to.out.includes(wp.id);
      if (dual && toId < wp.id) continue; // emit each dual pair once
      edges.push({
        from: wp.id,
        to: toId,
        kind: dual ? "dual" : to.incoming.includes(wp.id) ? "oneway" : "reverse",
      });
    }
  }
  return edges;
}

export function setFlagOn(net: RouteNetwork, ids: Iterable<number>, flag: number, on: boolean) {
  for (const id of ids) {
    const wp = net.waypoints.get(id);
    if (!wp) continue;
    wp.flags = on ? wp.flags | flag : wp.flags & ~flag;
  }
}

export function moveWaypoints(net: RouteNetwork, ids: Iterable<number>, dx: number, dz: number) {
  for (const id of ids) {
    const wp = net.waypoints.get(id);
    if (!wp) continue;
    wp.x += dx;
    wp.z += dz;
  }
}

/** Waypoints sitting on one spot, with the node that stays named first. */
export interface StackedGroup {
  /** the node that survives the merge — the lowest id, usually the original */
  keepId: number;
  /** the nodes folded into it */
  mergeIds: number[];
}

export interface MergeResult {
  /** spots that had more than one node */
  groups: number;
  /** nodes removed */
  nodes: number;
  /** connections that collapsed onto an existing one, or onto themselves */
  connections: number;
  /** markers dropped because the node they moved to already had one */
  markers: number;
}

/**
 * Nodes that share a spot. Stacks come from stamping a blueprint twice, from
 * snapping two nodes onto the same grid crossing, or from merging routes that
 * were built separately — in every case the extra nodes are invisible on the
 * canvas but real in the file.
 *
 * Height is deliberately not part of the comparison: x/z is the spot on the
 * map, y only says how high the terrain is there.
 */
export function findStackedGroups(net: RouteNetwork, ids?: Iterable<number>): StackedGroup[] {
  const scope = ids ? new Set(ids) : null;
  const bySpot = new Map<string, number[]>();
  for (const wp of net.waypoints.values()) {
    if (scope && !scope.has(wp.id)) continue;
    const spot = `${wp.x},${wp.z}`;
    const stack = bySpot.get(spot);
    if (stack) stack.push(wp.id);
    else bySpot.set(spot, [wp.id]);
  }

  const groups: StackedGroup[] = [];
  for (const stack of bySpot.values()) {
    if (stack.length < 2) continue;
    const sorted = stack.sort((a, b) => a - b);
    groups.push({ keepId: sorted[0], mergeIds: sorted.slice(1) });
  }
  return groups;
}

/**
 * Fold each group onto its surviving node: connections and flags are unioned,
 * links that would point at the node itself are dropped, and markers ride
 * along. The lists are merged rather than re-connected edge by edge, which is
 * what makes a one-way pair meeting its opposite come out as a two-way link.
 */
export function mergeStacked(net: RouteNetwork, groups: StackedGroup[]): MergeResult {
  const survivorOf = new Map<number, number>();
  for (const group of groups) {
    for (const id of group.mergeIds) {
      if (net.waypoints.has(id) && net.waypoints.has(group.keepId)) survivorOf.set(id, group.keepId);
    }
  }
  if (survivorOf.size === 0) return { groups: 0, nodes: 0, connections: 0, markers: 0 };

  const before = countLinks(net);
  for (const [mergedId, keepId] of survivorOf) {
    const merged = net.waypoints.get(mergedId)!;
    const keep = net.waypoints.get(keepId)!;
    for (const target of merged.out) pushUnique(keep.out, target);
    for (const source of merged.incoming) pushUnique(keep.incoming, source);
    keep.flags |= merged.flags;
  }

  const survivor = (id: number) => survivorOf.get(id) ?? id;
  for (const wp of net.waypoints.values()) {
    wp.out = redirect(wp.out, wp.id, survivor);
    wp.incoming = redirect(wp.incoming, wp.id, survivor);
  }
  for (const id of survivorOf.keys()) net.waypoints.delete(id);

  const markers = mergeMarkers(net, survivor);
  return {
    groups: new Set(survivorOf.values()).size,
    nodes: survivorOf.size,
    connections: before - countLinks(net),
    markers,
  };
}

/** Point a link list at the surviving nodes, without duplicates or self-links. */
function redirect(ids: number[], ownId: number, survivor: (id: number) => number): number[] {
  const redirected: number[] = [];
  for (const id of ids) {
    const target = survivor(id);
    if (target !== ownId) pushUnique(redirected, target);
  }
  return redirected;
}

/**
 * Markers follow their node. Where that puts two markers on one node the
 * later one is dropped, but markers on nodes the merge did not touch are left
 * exactly as the file had them.
 */
function mergeMarkers(net: RouteNetwork, survivor: (id: number) => number): number {
  const taken = new Set(net.markers.filter((m) => survivor(m.wpId) === m.wpId).map((m) => m.wpId));
  const kept: MapMarker[] = [];
  let dropped = 0;
  for (const marker of net.markers) {
    const wpId = survivor(marker.wpId);
    if (wpId === marker.wpId) {
      kept.push(marker);
      continue;
    }
    if (taken.has(wpId)) {
      dropped++;
      continue;
    }
    taken.add(wpId);
    kept.push({ ...marker, wpId });
  }
  net.markers = kept;
  return dropped;
}

/** Directed links in the whole network, counted one per list entry. */
function countLinks(net: RouteNetwork): number {
  let links = 0;
  for (const wp of net.waypoints.values()) links += wp.out.length;
  return links;
}

/** y for a new free-standing node: nearest existing node's height, else 0. */
export function estimateY(net: RouteNetwork, x: number, z: number): number {
  let bestDist = Infinity;
  let bestY = 0;
  for (const wp of net.waypoints.values()) {
    const d = (wp.x - x) * (wp.x - x) + (wp.z - z) * (wp.z - z);
    if (d < bestDist) {
      bestDist = d;
      bestY = wp.y;
    }
  }
  return bestY;
}

/**
 * Connect a -> b in a straight line, creating a node at every crossing of a
 * grid line on either axis. Consecutive nodes are linked with `mode` and
 * heights are interpolated. The grid's offset is honoured, so the inserted
 * nodes land on the same lines the canvas draws.
 * Returns the ids of the created intermediate nodes.
 */
export function connectAcrossGrid(
  net: RouteNetwork,
  aId: number,
  bId: number,
  grid: Grid,
  mode: ConnectionMode
): number[] {
  const a = net.waypoints.get(aId);
  const b = net.waypoints.get(bId);
  if (!a || !b || aId === bId || grid.size <= 0) return [];

  // the subdivided route replaces any existing direct link
  disconnect(net, aId, bId);

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const ts: number[] = [];

  const crossings = (from: number, delta: number, offset: number) => {
    if (Math.abs(delta) < 1e-9) return;
    const to = from + delta;
    const first = Math.ceil((Math.min(from, to) - offset) / grid.size);
    const last = Math.floor((Math.max(from, to) - offset) / grid.size);
    for (let k = first; k <= last; k++) {
      const t = (k * grid.size + offset - from) / delta;
      if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
    }
  };
  crossings(a.x, dx, grid.offsetX);
  crossings(a.z, dz, grid.offsetZ);

  ts.sort((p, q) => p - q);
  // merge crossings that coincide (diagonal through a grid corner)
  const merged: number[] = [];
  const minStep = (grid.size * 0.01) / Math.max(Math.hypot(dx, dz), 1e-9);
  for (const t of ts) {
    if (merged.length === 0 || t - merged[merged.length - 1] > minStep) merged.push(t);
  }

  const created: number[] = [];
  let prev = aId;
  for (const t of merged) {
    const wp = addWaypoint(net, a.x + dx * t, a.y + (b.y - a.y) * t, a.z + dz * t);
    connect(net, prev, wp.id, mode);
    created.push(wp.id);
    prev = wp.id;
  }
  connect(net, prev, bId, mode);
  return created;
}

/** Insert a node in the middle of the connection between a and b, preserving direction/kind. */
export function insertMidpoint(net: RouteNetwork, aId: number, bId: number): number | null {
  const edge = connectionBetween(net, aId, bId);
  if (!edge) return null;
  const a = net.waypoints.get(edge.from)!;
  const b = net.waypoints.get(edge.to)!;
  const mid = addWaypoint(net, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  disconnect(net, aId, bId);
  connect(net, edge.from, mid.id, edge.kind);
  connect(net, mid.id, edge.to, edge.kind);
  return mid.id;
}

/**
 * Order a set of selected waypoints into a simple chain by following connections.
 * Returns null when the selection isn't a single unbranched path.
 */
export function orderAsChain(net: RouteNetwork, ids: Set<number>): number[] | null {
  if (ids.size < 2) return null;
  const neighbors = new Map<number, number[]>();
  for (const id of ids) {
    const wp = net.waypoints.get(id);
    if (!wp) return null;
    const near = new Set<number>();
    for (const t of wp.out) if (ids.has(t)) near.add(t);
    for (const t of wp.incoming) if (ids.has(t)) near.add(t);
    // reverse links only appear in the other node's out list
    for (const other of ids) {
      const o = net.waypoints.get(other);
      if (o && o.out.includes(id)) near.add(other);
    }
    near.delete(id);
    neighbors.set(id, Array.from(near));
  }
  const ends = Array.from(ids).filter((id) => neighbors.get(id)!.length === 1);
  if (ends.length !== 2) return null;
  const chain = [ends[0]];
  const visited = new Set(chain);
  while (chain.length < ids.size) {
    const next = neighbors.get(chain[chain.length - 1])!.find((n) => !visited.has(n));
    if (next === undefined) return null;
    chain.push(next);
    visited.add(next);
  }
  return chain;
}

/** Distribute the interior nodes of a chain evenly along its polyline. */
export function evenlySpaceChain(net: RouteNetwork, chain: number[]) {
  if (chain.length < 3) return;
  const pts = chain.map((id) => net.waypoints.get(id)!);
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    segLengths.push(l);
    total += l;
  }
  if (total < 1e-6) return;
  const step = total / (pts.length - 1);
  for (let i = 1; i < pts.length - 1; i++) {
    let target = step * i;
    let seg = 0;
    while (seg < segLengths.length - 1 && target > segLengths[seg]) {
      target -= segLengths[seg];
      seg++;
    }
    const t = segLengths[seg] < 1e-9 ? 0 : target / segLengths[seg];
    const p0 = pts[seg];
    const p1 = pts[seg + 1];
    const wp = net.waypoints.get(chain[i])!;
    wp.x = p0.x + (p1.x - p0.x) * t;
    wp.y = p0.y + (p1.y - p0.y) * t;
    wp.z = p0.z + (p1.z - p0.z) * t;
  }
}

/**
 * Create a smooth cubic Hermite curve from a to b.
 * Tangents come from each node's existing neighbors so the curve continues
 * the direction of the roads it joins. Intermediate nodes are linked with `mode`.
 */
export function smoothCurve(
  net: RouteNetwork,
  aId: number,
  bId: number,
  segments: number,
  mode: ConnectionMode
): number[] {
  const a = net.waypoints.get(aId);
  const b = net.waypoints.get(bId);
  if (!a || !b || segments < 2) return [];

  // the curve replaces any existing direct link
  disconnect(net, aId, bId);

  const dist = Math.hypot(b.x - a.x, b.z - a.z);

  // Direction of travel through wp, derived from its neighbors (excluding the
  // other curve endpoint): out-neighbors point away from wp, incoming point into it.
  // chord = intended direction of the curve at wp; used to reject neighbors that
  // would bend the curve back on itself, falling back to the chord itself.
  const tangentAt = (wp: Waypoint, chordX: number, chordZ: number): [number, number] => {
    const others = [...wp.out, ...wp.incoming].filter((id) => id !== aId && id !== bId);
    const chordL = Math.hypot(chordX, chordZ) || 1;
    for (const id of others) {
      const n = net.waypoints.get(id);
      if (!n) continue;
      const isOut = wp.out.includes(id);
      const vx = isOut ? n.x - wp.x : wp.x - n.x;
      const vz = isOut ? n.z - wp.z : wp.z - n.z;
      const l = Math.hypot(vx, vz);
      if (l < 1e-6) continue;
      if ((vx * chordX + vz * chordZ) / (l * chordL) > -0.5) {
        return [(vx / l) * dist, (vz / l) * dist];
      }
    }
    return [chordX, chordZ];
  };

  const [m0x, m0z] = tangentAt(a, b.x - a.x, b.z - a.z);
  const [m1x, m1z] = tangentAt(b, b.x - a.x, b.z - a.z);

  const created: number[] = [];
  let prev = aId;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const x = h00 * a.x + h10 * m0x + h01 * b.x + h11 * m1x;
    const z = h00 * a.z + h10 * m0z + h01 * b.z + h11 * m1z;
    const y = a.y + (b.y - a.y) * t;
    const wp = addWaypoint(net, x, y, z);
    connect(net, prev, wp.id, mode);
    created.push(wp.id);
    prev = wp.id;
  }
  connect(net, prev, bId, mode);
  return created;
}
