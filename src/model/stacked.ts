import { MapMarker, RouteNetwork, Waypoint } from "./types";

/**
 * Finding and merging waypoints that sit on one spot.
 *
 * "One spot" cannot mean identical coordinates. Nodes that are the same place
 * on the map routinely differ in the last bits of a float — two grid routes
 * crossing the same grid line compute that crossing from different endpoints,
 * and a config that has been through the game and back carries whatever
 * precision it was written with. Everything here therefore works to a
 * tolerance, and exact matching is just the tolerance set to zero.
 */

/** Closer than this and no route needs two nodes; the default the button uses. */
export const DEFAULT_STACK_TOLERANCE_M = 0.1;

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
 * Nodes sharing a spot, within `tolerance` meters. Stacks come from stamping a
 * blueprint twice, from two routes built separately meeting at the same
 * crossing, or from a node dragged onto its neighbour — in every case the
 * extra nodes are invisible on the canvas but real in the file.
 *
 * Height is deliberately not part of the comparison: x/z is the spot on the
 * map, y only says how high the terrain is there.
 */
export function findStackedGroups(
  net: RouteNetwork,
  tolerance = DEFAULT_STACK_TOLERANCE_M,
  ids?: Iterable<number>
): StackedGroup[] {
  const scope = ids ? new Set(ids) : null;
  const nodes = Array.from(net.waypoints.values()).filter((wp) => !scope || scope.has(wp.id));
  const clusters = tolerance > 0 ? clustersWithin(nodes, tolerance) : clustersOnExactSpot(nodes);

  const groups: StackedGroup[] = [];
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    const sorted = cluster.sort((a, b) => a - b);
    groups.push({ keepId: sorted[0], mergeIds: sorted.slice(1) });
  }
  // report them in map order, so the first stack listed is the first one made
  return groups.sort((a, b) => a.keepId - b.keepId);
}

/**
 * Fold each group onto its surviving node: connections and flags are unioned,
 * links that would point at the node itself are dropped, and markers ride
 * along. The lists are merged rather than re-connected edge by edge, which is
 * what makes a one-way pair meeting its opposite come out as a two-way link.
 *
 * The survivor keeps its own position — within the tolerance the others were
 * on that spot anyway, and moving it would drag the connected route with it.
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

// ---- clustering ----

/** Ids grouped by identical x/z. Used when the tolerance is zero. */
function clustersOnExactSpot(nodes: Waypoint[]): number[][] {
  const bySpot = new Map<string, number[]>();
  for (const wp of nodes) {
    const spot = `${wp.x},${wp.z}`;
    const stack = bySpot.get(spot);
    if (stack) stack.push(wp.id);
    else bySpot.set(spot, [wp.id]);
  }
  return Array.from(bySpot.values());
}

/**
 * Ids grouped by proximity. Buckets of one tolerance across make this linear
 * in practice: a node can only be within tolerance of a node in one of the
 * nine buckets around it, so no pair beyond that is ever measured.
 */
function clustersWithin(nodes: Waypoint[], tolerance: number): number[][] {
  const buckets = new Map<string, Waypoint[]>();
  for (const wp of nodes) {
    const key = bucketKey(wp.x, wp.z, tolerance);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(wp);
    else buckets.set(key, [wp]);
  }

  const union = new UnionFind();
  const limit = tolerance * tolerance;
  for (const wp of nodes) {
    for (const other of neighbours(buckets, wp, tolerance)) {
      if (other.id <= wp.id) continue;
      const dx = other.x - wp.x;
      const dz = other.z - wp.z;
      if (dx * dx + dz * dz <= limit) union.join(wp.id, other.id);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (const wp of nodes) {
    const root = union.rootOf(wp.id);
    const cluster = byRoot.get(root);
    if (cluster) cluster.push(wp.id);
    else byRoot.set(root, [wp.id]);
  }
  return Array.from(byRoot.values());
}

/** The nodes in the nine buckets around one node, itself included. */
function neighbours(buckets: Map<string, Waypoint[]>, wp: Waypoint, tolerance: number): Waypoint[] {
  const cx = Math.floor(wp.x / tolerance);
  const cz = Math.floor(wp.z / tolerance);
  const found: Waypoint[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bucket = buckets.get(`${cx + dx}:${cz + dz}`);
      if (bucket) found.push(...bucket);
    }
  }
  return found;
}

function bucketKey(x: number, z: number, tolerance: number): string {
  return `${Math.floor(x / tolerance)}:${Math.floor(z / tolerance)}`;
}

/** Disjoint sets over waypoint ids, so a chain of near nodes forms one stack. */
class UnionFind {
  private parent = new Map<number, number>();

  rootOf(id: number): number {
    let root = this.parent.get(id) ?? id;
    while (root !== (this.parent.get(root) ?? root)) root = this.parent.get(root)!;
    // path compression keeps repeated lookups flat
    let walk = id;
    while (walk !== root) {
      const next = this.parent.get(walk) ?? walk;
      this.parent.set(walk, root);
      walk = next;
    }
    return root;
  }

  join(a: number, b: number): void {
    const rootA = this.rootOf(a);
    const rootB = this.rootOf(b);
    if (rootA !== rootB) this.parent.set(Math.max(rootA, rootB), Math.min(rootA, rootB));
  }
}

// ---- merge helpers ----

function pushUnique(ids: number[], id: number): void {
  if (!ids.includes(id)) ids.push(id);
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
