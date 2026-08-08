import { ViewTransform } from "../state/store";

/**
 * Conversion between world coordinates (meters, AutoDrive space) and screen
 * pixels. Rendering, hit-testing and pointer handling all go through this so
 * the projection is defined exactly once.
 */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  toScreenX(worldX: number): number;
  toScreenY(worldZ: number): number;
  toWorldX(screenX: number): number;
  toWorldZ(screenY: number): number;
  /** true when a screen point is within `margin` pixels of the visible area */
  isVisible(screenX: number, screenY: number, margin?: number): boolean;
}

export function createViewport(view: ViewTransform, width: number, height: number): Viewport {
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    width,
    height,
    scale: view.scale,
    toScreenX: (worldX) => (worldX - view.cx) * view.scale + halfW,
    toScreenY: (worldZ) => (worldZ - view.cz) * view.scale + halfH,
    toWorldX: (screenX) => (screenX - halfW) / view.scale + view.cx,
    toWorldZ: (screenY) => (screenY - halfH) / view.scale + view.cz,
    isVisible: (screenX, screenY, margin = 40) =>
      screenX >= -margin && screenX <= width + margin && screenY >= -margin && screenY <= height + margin,
  };
}

/** Zoom around a fixed world point, keeping it under the cursor. */
export function zoomAt(view: ViewTransform, worldX: number, worldZ: number, factor: number): ViewTransform {
  const scale = clampScale(view.scale * factor);
  const ratio = view.scale / scale;
  return {
    cx: worldX - (worldX - view.cx) * ratio,
    cz: worldZ - (worldZ - view.cz) * ratio,
    scale,
  };
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 60;

export function clampScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

/** Axis-aligned world-space rectangle from two screen points. */
export interface WorldRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function worldRectFromScreen(
  viewport: Viewport,
  ax: number,
  ay: number,
  bx: number,
  by: number
): WorldRect {
  const x0 = viewport.toWorldX(ax);
  const x1 = viewport.toWorldX(bx);
  const z0 = viewport.toWorldZ(ay);
  const z1 = viewport.toWorldZ(by);
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
  };
}
