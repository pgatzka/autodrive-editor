import { ConnectionMode } from "../model/types";

/**
 * Canvas visual spec ("Grammar B — cased" from the design system).
 * The canvas is drawn imperatively and cannot use CSS, so every value the
 * renderer needs lives here as a literal. `s` throughout is the zoom in
 * pixels per meter (0.05–60).
 */

export const CANVAS_COLORS = {
  /** flat field shown when no savegame terrain is loaded */
  field: "#3B4636",
  fieldBlueprint: "#1A1630",
  gridMinor: "rgba(226,238,235,.05)",
  gridMajor: "rgba(226,238,235,.16)",
  gridMinorBlueprint: "rgba(139,123,240,.10)",
  gridMajorBlueprint: "rgba(139,123,240,.24)",
  node: "#E9F0EE",
  nodeCore: "#0E1213",
  nodeSubprio: "#F2A93B",
  nodeSelected: "#4EC9F5",
  pending: "#FFFFFF",
  /** dark casing under every link, so lines read over any terrain tint */
  linkCasing: "rgba(8,11,12,.6)",
  marker: "#5BD6A0",
  markerLabelText: "#07110C",
  worldIcon: "rgba(233,240,238,.55)",
  rubberBandFill: "rgba(78,201,245,.14)",
  rubberBandEdge: "#4EC9F5",
  blueprint: "#8B7BF0",
  danger: "#FF5C63",
} as const;

/** Links differ by marks as well as color, so they are legible without hue. */
export const CONNECTION_COLORS: Record<ConnectionMode, string> = {
  oneway: "#4EC9F5",
  dual: "#D8E2E0",
  reverse: "#F2A93B",
};

export const CANVAS_FONT = "600 11px 'IBM Plex Sans', system-ui, sans-serif";
export const CANVAS_MONO = "11px 'IBM Plex Mono', ui-monospace, monospace";

/** Zoom thresholds (px per meter) at which detail appears. */
export const ZOOM = {
  /** below this a node is a solid dot — the ring is illegible */
  ringLegible: 3,
  chevrons: 0.6,
  reverseDoubleRail: 1,
  markerPin: 1.2,
  markerLabel: 2.2,
  placeableShape: 0.4,
  vehicleShape: 0.8,
  iconLabel: 3,
  ghostRotationCircle: 1,
} as const;

/**
 * Terrain is one texel per metre: above this zoom a texel covers more than a
 * pixel, so it is drawn with nearest-neighbour to keep the painted ground
 * tiles crisp; below it, interpolation avoids aliasing.
 */
export const MIN_SMOOTHING_SCALE = 1;

/** Grid lines are dropped when they would be denser than this. */
export const MIN_GRID_SPACING_PX = 6;

/** r = clamp(2.2, s·0.95, 7) */
export function nodeRadius(scale: number): number {
  return clamp(scale * 0.95, 2.2, 7);
}

/** t = clamp(1.2, s·0.5, 3.4) */
export function linkWidth(scale: number): number {
  return clamp(scale * 0.5, 1.2, 3.4);
}

/** Casing is 3 px wider than the link it sits under. */
export function casingWidth(scale: number): number {
  return linkWidth(scale) + 3;
}

/** Chevrons repeat every max(16, 9·t) px along a one-way link. */
export function chevronSpacing(scale: number): number {
  return Math.max(16, 9 * linkWidth(scale));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
