// AutoDrive waypoint flags (from FS25_AutoDrive scripts/AutoDrive.lua)
export const FLAG_NONE = 0;
export const FLAG_SUBPRIO = 1;
export const FLAG_TRAFFIC_SYSTEM = 2;
export const FLAG_TRAFFIC_SYSTEM_CONNECTION = 4;

export interface Waypoint {
  id: number;
  x: number;
  y: number;
  z: number;
  /** ids this waypoint drives to */
  out: number[];
  /** ids that drive into this waypoint (absent for reverse connections) */
  incoming: number[];
  flags: number;
}

export interface MapMarker {
  /** waypoint id the marker sits on */
  wpId: number;
  name: string;
  group: string;
}

export interface RouteNetwork {
  waypoints: Map<number, Waypoint>;
  markers: MapMarker[];
  /** group names; "All" always exists */
  groups: string[];
  mapName: string;
  routeAuthor: string;
  routeVersion: string;
  nextId: number;
}

export type ConnectionMode = "oneway" | "dual" | "reverse";

/** A resolved edge for rendering / hit-testing. Emitted once per pair for dual. */
export interface Edge {
  from: number;
  to: number;
  kind: ConnectionMode;
}

export interface Blueprint {
  /** schema marker so shared files are self-describing */
  format: "autodrive-editor-blueprint";
  version: 1;
  name: string;
  /** nodes with coordinates relative to the blueprint origin (centroid at capture) */
  nodes: { x: number; y: number; z: number; flags: number }[];
  /** internal connections by node index */
  edges: { from: number; to: number; kind: ConnectionMode }[];
  markers: { node: number; name: string; group: string }[];
}

export function emptyNetwork(): RouteNetwork {
  return {
    waypoints: new Map(),
    markers: [],
    groups: ["All"],
    mapName: "",
    routeAuthor: "",
    routeVersion: "",
    nextId: 1,
  };
}
