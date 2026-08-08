import { ConnectionMode } from "../model/types";

/** Single source of truth for canvas colors. */
export const CANVAS_COLORS = {
  background: "#3a5a40",
  backgroundBlueprint: "#34505c",
  gridMinor: "rgba(255,255,255,0.07)",
  gridMajor: "rgba(255,255,255,0.16)",
  node: "#e05555",
  nodeSubprio: "#f0c93f",
  nodeSelected: "#ffffff",
  marker: "#ffd83d",
  ghost: "rgba(255,255,255,0.55)",
  anchor: "rgba(255,255,255,0.65)",
  marquee: "rgba(120,180,255,0.25)",
  marqueeBorder: "rgba(120,180,255,0.9)",
  placeable: "rgba(240,240,255,0.9)",
  vehicle: "rgba(120,200,255,0.9)",
} as const;

export const CONNECTION_COLORS: Record<ConnectionMode, string> = {
  oneway: "#7ddc7d",
  dual: "#6fb3ff",
  reverse: "#ffab52",
};

export const CANVAS_FONT = "11px system-ui, sans-serif";
export const MARKER_FONT = "12px system-ui, sans-serif";

/** Node radius in pixels, clamped so nodes stay visible at any zoom. */
export function nodeRadius(scale: number): number {
  return Math.min(Math.max(scale * 0.5, 3), 9);
}

export function edgeWidth(scale: number): number {
  return Math.min(Math.max(scale * 0.35, 1), 4);
}
