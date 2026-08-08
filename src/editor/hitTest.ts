import { RouteNetwork, Waypoint } from "../model/types";
import { WorldRect } from "./viewport";

/** Screen-space radius (px) a node must be within to be picked. */
const PICK_RADIUS_PX = 6;
/** Never pick beyond this world radius, however far the view is zoomed out. */
const MIN_PICK_RADIUS_M = 0.8;

export function pickRadius(scale: number): number {
  return Math.max(PICK_RADIUS_PX / scale, MIN_PICK_RADIUS_M);
}

/** Nearest waypoint to a world position within the pick radius, or null. */
export function findNodeAt(net: RouteNetwork, x: number, z: number, scale: number): Waypoint | null {
  const radius = pickRadius(scale);
  let best: Waypoint | null = null;
  let bestDistSq = radius * radius;
  for (const wp of net.waypoints.values()) {
    const dx = wp.x - x;
    const dz = wp.z - z;
    const distSq = dx * dx + dz * dz;
    if (distSq <= bestDistSq) {
      best = wp;
      bestDistSq = distSq;
    }
  }
  return best;
}

/** Ids of all waypoints inside a world rectangle. */
export function findNodesInRect(net: RouteNetwork, rect: WorldRect): number[] {
  const ids: number[] = [];
  for (const wp of net.waypoints.values()) {
    if (wp.x >= rect.minX && wp.x <= rect.maxX && wp.z >= rect.minZ && wp.z <= rect.maxZ) {
      ids.push(wp.id);
    }
  }
  return ids;
}
