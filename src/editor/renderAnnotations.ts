import { SavegameBackground } from "../model/background";
import { placedPositions } from "../model/blueprint";
import { Blueprint, RouteNetwork } from "../model/types";

interface WorldPoint {
  x: number;
  z: number;
}
import {
  drawCrosshair,
  fillCircle,
  fillTriangle,
  roundedRectPath,
  strokeCircle,
  strokeLine,
} from "./canvasPrimitives";
import type { MarqueeRect } from "./renderScene";
import { CANVAS_COLORS, CANVAS_FONT, nodeRadius, ZOOM } from "./theme";
import { Viewport } from "./viewport";

/**
 * Annotation layers drawn over the network: markers, the savegame's world
 * objects, and the transient overlays (blueprint ghost, workspace anchor,
 * rubber band). Kept apart from the network layers so each file is about one
 * thing.
 */

export function drawMarkers(ctx: CanvasRenderingContext2D, viewport: Viewport, network: RouteNetwork): void {
  if (viewport.scale < ZOOM.markerPin) return;
  const radius = nodeRadius(viewport.scale);
  const withLabel = viewport.scale >= ZOOM.markerLabel;
  ctx.font = CANVAS_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const marker of network.markers) {
    const waypoint = network.waypoints.get(marker.wpId);
    if (!waypoint) continue;
    const sx = viewport.toScreenX(waypoint.x);
    const sy = viewport.toScreenY(waypoint.z);
    if (!viewport.isVisible(sx, sy)) continue;

    const tip = sy - radius - 6;
    ctx.fillStyle = CANVAS_COLORS.marker;
    fillTriangle(ctx, { x: sx, y: tip }, { x: sx + 4, y: tip - 7 }, { x: sx - 4, y: tip - 7 });
    if (!withLabel) continue;

    const width = ctx.measureText(marker.name).width + 12;
    const height = 16;
    const top = tip - 7 - height - 2;
    roundedRectPath(ctx, { x: sx - width / 2, y: top, width, height }, 4);
    ctx.fill();
    ctx.fillStyle = CANVAS_COLORS.markerLabelText;
    ctx.fillText(marker.name, sx, top + height / 2);
  }
  ctx.textBaseline = "alphabetic";
}

export function drawWorldIcons(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  background: SavegameBackground
): void {
  ctx.font = CANVAS_FONT;
  ctx.textAlign = "center";
  const withLabels = viewport.scale >= ZOOM.iconLabel;

  if (viewport.scale >= ZOOM.placeableShape) {
    ctx.strokeStyle = CANVAS_COLORS.worldIcon;
    ctx.fillStyle = CANVAS_COLORS.worldIcon;
    ctx.lineWidth = 1.25;
    for (const icon of background.placeables) {
      const sx = viewport.toScreenX(icon.x);
      const sy = viewport.toScreenY(icon.z);
      if (!viewport.isVisible(sx, sy)) continue;
      const size = Math.max(6, 8 * Math.min(viewport.scale, 2));
      roundedRectPath(ctx, { x: sx - size / 2, y: sy - size / 2, width: size, height: size }, 2);
      ctx.stroke();
      if (withLabels && icon.label) ctx.fillText(icon.label, sx, sy - size / 2 - 4);
    }
  }

  if (viewport.scale >= ZOOM.vehicleShape) {
    ctx.fillStyle = CANVAS_COLORS.worldIcon;
    for (const icon of background.vehicles) {
      const sx = viewport.toScreenX(icon.x);
      const sy = viewport.toScreenY(icon.z);
      if (!viewport.isVisible(sx, sy)) continue;
      fillTriangle(ctx, { x: sx, y: sy - 6 }, { x: sx + 5, y: sy + 5 }, { x: sx - 5, y: sy + 5 });
      if (withLabels && icon.label) ctx.fillText(icon.label, sx, sy - 9);
    }
  }
}

export function drawGhost(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  blueprint: Blueprint,
  rotation: number,
  cursor: { x: number; z: number }
): void {
  const positions = placedPositions(blueprint, { x: cursor.x, z: cursor.z, rotation });
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = CANVAS_COLORS.blueprint;
  ctx.fillStyle = CANVAS_COLORS.blueprint;
  ctx.lineWidth = 1.5;

  for (const edge of blueprint.edges) {
    strokeLine(
      ctx,
      viewport.toScreenX(positions[edge.from].x),
      viewport.toScreenY(positions[edge.from].z),
      viewport.toScreenX(positions[edge.to].x),
      viewport.toScreenY(positions[edge.to].z)
    );
  }
  const radius = Math.max(nodeRadius(viewport.scale) - 1, 2);
  for (const position of positions) {
    fillCircle(ctx, viewport.toScreenX(position.x), viewport.toScreenY(position.z), radius);
  }

  // rotation circle shows the pivot the R key turns the stamp around
  if (viewport.scale >= ZOOM.ghostRotationCircle) {
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    strokeCircle(ctx, viewport.toScreenX(cursor.x), viewport.toScreenY(cursor.z), 42 * viewport.scale);
    ctx.setLineDash([]);
  }
  drawCrosshair(ctx, viewport.toScreenX(cursor.x), viewport.toScreenY(cursor.z), 10);
  ctx.globalAlpha = 1;
}

/**
 * Marks the blueprint anchor — the point that lands under the cursor when the
 * blueprint is stamped. It is the fixed workspace origin, so it does not drift
 * as nodes are added or moved.
 */
export function drawAnchor(ctx: CanvasRenderingContext2D, viewport: Viewport, anchor: WorldPoint): void {
  const sx = viewport.toScreenX(anchor.x);
  const sy = viewport.toScreenY(anchor.z);

  ctx.strokeStyle = CANVAS_COLORS.blueprint;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 4]);
  strokeLine(ctx, 0, sy, viewport.width, sy);
  strokeLine(ctx, sx, 0, sx, viewport.height);
  ctx.setLineDash([]);
  strokeCircle(ctx, sx, sy, 8);
}

export function drawRubberBand(ctx: CanvasRenderingContext2D, rect: MarqueeRect): void {
  const x = Math.min(rect.x0, rect.x1);
  const y = Math.min(rect.y0, rect.y1);
  const width = Math.abs(rect.x1 - rect.x0);
  const height = Math.abs(rect.y1 - rect.y0);
  ctx.fillStyle = CANVAS_COLORS.rubberBandFill;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = CANVAS_COLORS.rubberBandEdge;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  ctx.setLineDash([]);
}
