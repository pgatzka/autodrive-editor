import { SavegameBackground } from "../model/background";
import { Blueprint } from "../model/types";
import { placedPositions } from "../model/blueprint";
import { allEdges } from "../model/graph";
import { FLAG_SUBPRIO, RouteNetwork } from "../model/types";
import { EditorState } from "../state/store";
import { CANVAS_COLORS, CANVAS_FONT, CONNECTION_COLORS, edgeWidth, MARKER_FONT, nodeRadius } from "./theme";
import { Viewport } from "./viewport";

/**
 * Canvas drawing. Every function takes the context and a viewport and draws
 * one layer; `renderScene` composes them in paint order. Keeping the layers
 * separate means each one can change without touching the others.
 */

export interface MarqueeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SceneOverlays {
  /** cursor position in world space, for ghost previews */
  cursor: { x: number; z: number } | null;
  marquee: MarqueeRect | null;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  viewport: Viewport,
  overlays: SceneOverlays
): void {
  const inBlueprintMode = state.blueprintEdit !== null;

  drawBackdrop(ctx, viewport, inBlueprintMode);
  if (state.background && !inBlueprintMode) {
    drawTerrain(ctx, viewport, state.background, state.settings.backgroundOpacity);
  }
  drawGrid(ctx, viewport, state.settings.gridSize);
  drawEdges(ctx, viewport, state.network);
  drawPendingConnection(ctx, viewport, state, overlays.cursor);
  if (state.background && !inBlueprintMode && state.settings.showIcons) {
    drawWorldIcons(ctx, viewport, state.background);
  }
  if (inBlueprintMode) drawBlueprintAnchor(ctx, viewport, state.network);
  drawNodes(ctx, viewport, state);
  if (state.placement && overlays.cursor) {
    drawBlueprintGhost(ctx, viewport, state.placement.blueprint, state.placement.rotation, overlays.cursor);
  }
  if (overlays.marquee) drawMarquee(ctx, overlays.marquee);
}

function drawBackdrop(ctx: CanvasRenderingContext2D, viewport: Viewport, blueprintMode: boolean): void {
  ctx.fillStyle = blueprintMode ? CANVAS_COLORS.backgroundBlueprint : CANVAS_COLORS.background;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  background: SavegameBackground,
  opacity: number
): void {
  const half = background.sizeMeters / 2;
  ctx.globalAlpha = opacity;
  // crisp texels when zoomed in, smoothed when the map is minified
  ctx.imageSmoothingEnabled = viewport.scale < 1;
  ctx.drawImage(
    background.canvas,
    viewport.toScreenX(-half),
    viewport.toScreenY(-half),
    background.sizeMeters * viewport.scale,
    background.sizeMeters * viewport.scale
  );
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 1;
}

/** Grid lines are skipped when they would be denser than this many pixels. */
const MIN_GRID_SPACING_PX = 6;
const MAJOR_GRID_EVERY = 10;

function drawGrid(ctx: CanvasRenderingContext2D, viewport: Viewport, gridSize: number): void {
  if (gridSize <= 0 || gridSize * viewport.scale < MIN_GRID_SPACING_PX) return;

  const minX = viewport.toWorldX(0);
  const maxX = viewport.toWorldX(viewport.width);
  const minZ = viewport.toWorldZ(0);
  const maxZ = viewport.toWorldZ(viewport.height);
  ctx.lineWidth = 1;

  for (let x = Math.floor(minX / gridSize) * gridSize; x <= maxX; x += gridSize) {
    ctx.strokeStyle = isMajor(x, gridSize) ? CANVAS_COLORS.gridMajor : CANVAS_COLORS.gridMinor;
    const sx = viewport.toScreenX(x);
    strokeLine(ctx, sx, 0, sx, viewport.height);
  }
  for (let z = Math.floor(minZ / gridSize) * gridSize; z <= maxZ; z += gridSize) {
    ctx.strokeStyle = isMajor(z, gridSize) ? CANVAS_COLORS.gridMajor : CANVAS_COLORS.gridMinor;
    const sy = viewport.toScreenY(z);
    strokeLine(ctx, 0, sy, viewport.width, sy);
  }
}

function isMajor(coordinate: number, gridSize: number): boolean {
  return Math.round(coordinate / gridSize) % MAJOR_GRID_EVERY === 0;
}

/** Arrow heads are only legible above this zoom. */
const MIN_ARROW_SCALE = 1.2;

function drawEdges(ctx: CanvasRenderingContext2D, viewport: Viewport, network: RouteNetwork): void {
  ctx.lineWidth = edgeWidth(viewport.scale);
  const withArrows = viewport.scale > MIN_ARROW_SCALE;

  for (const edge of allEdges(network)) {
    const from = network.waypoints.get(edge.from)!;
    const to = network.waypoints.get(edge.to)!;
    const ax = viewport.toScreenX(from.x);
    const ay = viewport.toScreenY(from.z);
    const bx = viewport.toScreenX(to.x);
    const by = viewport.toScreenY(to.z);
    if (!viewport.isVisible(ax, ay) && !viewport.isVisible(bx, by)) continue;

    ctx.strokeStyle = CONNECTION_COLORS[edge.kind];
    ctx.setLineDash(edge.kind === "reverse" ? [6, 4] : []);
    strokeLine(ctx, ax, ay, bx, by);
    ctx.setLineDash([]);
    if (withArrows && edge.kind !== "dual") drawArrowHead(ctx, ax, ay, bx, by);
  }
}

function drawPendingConnection(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  state: EditorState,
  cursor: { x: number; z: number } | null
): void {
  if (state.pendingConnectFrom === null || !cursor) return;
  const from = state.network.waypoints.get(state.pendingConnectFrom);
  if (!from) return;

  ctx.strokeStyle = CANVAS_COLORS.ghost;
  ctx.setLineDash([5, 5]);
  strokeLine(
    ctx,
    viewport.toScreenX(from.x),
    viewport.toScreenY(from.z),
    viewport.toScreenX(cursor.x),
    viewport.toScreenY(cursor.z)
  );
  ctx.setLineDash([]);
}

/** Icon labels are only drawn above this zoom. */
const MIN_LABEL_SCALE = 1.5;

function drawWorldIcons(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  background: SavegameBackground
): void {
  ctx.font = CANVAS_FONT;
  ctx.textAlign = "center";

  for (const icon of background.placeables) {
    const sx = viewport.toScreenX(icon.x);
    const sy = viewport.toScreenY(icon.z);
    if (!viewport.isVisible(sx, sy)) continue;
    ctx.fillStyle = CANVAS_COLORS.placeable;
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
    if (viewport.scale > MIN_LABEL_SCALE && icon.label) ctx.fillText(icon.label, sx, sy - 8);
  }

  for (const icon of background.vehicles) {
    const sx = viewport.toScreenX(icon.x);
    const sy = viewport.toScreenY(icon.z);
    if (!viewport.isVisible(sx, sy)) continue;
    ctx.fillStyle = CANVAS_COLORS.vehicle;
    fillTriangle(ctx, { x: sx, y: sy - 5 }, { x: sx + 5, y: sy + 4 }, { x: sx - 5, y: sy + 4 });
    if (viewport.scale > MIN_LABEL_SCALE && icon.label) ctx.fillText(icon.label, sx, sy - 8);
  }
}

function drawNodes(ctx: CanvasRenderingContext2D, viewport: Viewport, state: EditorState): void {
  const radius = nodeRadius(viewport.scale);
  const markerByWaypoint = new Map(state.network.markers.map((marker) => [marker.wpId, marker]));

  for (const wp of state.network.waypoints.values()) {
    const sx = viewport.toScreenX(wp.x);
    const sy = viewport.toScreenY(wp.z);
    if (!viewport.isVisible(sx, sy)) continue;

    ctx.fillStyle = (wp.flags & FLAG_SUBPRIO) !== 0 ? CANVAS_COLORS.nodeSubprio : CANVAS_COLORS.node;
    fillCircle(ctx, sx, sy, radius);

    if (state.selection.has(wp.id)) {
      ctx.strokeStyle = CANVAS_COLORS.nodeSelected;
      ctx.lineWidth = 2;
      strokeCircle(ctx, sx, sy, radius);
    }
    if (wp.id === state.pendingConnectFrom) {
      ctx.strokeStyle = CANVAS_COLORS.ghost;
      ctx.lineWidth = 2;
      strokeCircle(ctx, sx, sy, radius + 3);
    }

    const marker = markerByWaypoint.get(wp.id);
    if (marker) drawMarker(ctx, viewport, { x: sx, y: sy }, radius, marker.name);
  }
}

/** Marker labels are only drawn above this zoom. */
const MIN_MARKER_LABEL_SCALE = 0.8;

function drawMarker(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  anchor: ScreenPoint,
  radius: number,
  name: string
): void {
  const { x: sx, y: sy } = anchor;
  ctx.fillStyle = CANVAS_COLORS.marker;
  fillTriangle(
    ctx,
    { x: sx, y: sy - radius - 10 },
    { x: sx + 6, y: sy - radius - 3 },
    { x: sx - 6, y: sy - radius - 3 }
  );
  if (viewport.scale > MIN_MARKER_LABEL_SCALE) {
    ctx.font = MARKER_FONT;
    ctx.textAlign = "center";
    ctx.fillText(name, sx, sy - radius - 14);
  }
}

function drawBlueprintGhost(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  blueprint: Blueprint,
  rotation: number,
  cursor: { x: number; z: number }
): void {
  const positions = placedPositions(blueprint, { x: cursor.x, z: cursor.z, rotation });
  ctx.strokeStyle = CANVAS_COLORS.ghost;
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
  ctx.fillStyle = CANVAS_COLORS.ghost;
  const radius = Math.max(nodeRadius(viewport.scale) - 1, 2);
  for (const position of positions) {
    fillCircle(ctx, viewport.toScreenX(position.x), viewport.toScreenY(position.z), radius);
  }
}

/** Crosshair marking the point a blueprint is stamped by (its node centroid). */
function drawBlueprintAnchor(ctx: CanvasRenderingContext2D, viewport: Viewport, network: RouteNetwork): void {
  let x = 0;
  let z = 0;
  if (network.waypoints.size > 0) {
    for (const wp of network.waypoints.values()) {
      x += wp.x;
      z += wp.z;
    }
    x /= network.waypoints.size;
    z /= network.waypoints.size;
  }
  const sx = viewport.toScreenX(x);
  const sy = viewport.toScreenY(z);

  ctx.strokeStyle = CANVAS_COLORS.anchor;
  ctx.lineWidth = 1;
  strokeLine(ctx, sx - 14, sy, sx + 14, sy);
  strokeLine(ctx, sx, sy - 14, sx, sy + 14);
  strokeCircle(ctx, sx, sy, 8);
  ctx.fillStyle = CANVAS_COLORS.anchor;
  ctx.font = CANVAS_FONT;
  ctx.textAlign = "left";
  ctx.fillText("anchor", sx + 12, sy - 8);
}

function drawMarquee(ctx: CanvasRenderingContext2D, rect: MarqueeRect): void {
  const x = Math.min(rect.x0, rect.x1);
  const y = Math.min(rect.y0, rect.y1);
  const width = Math.abs(rect.x1 - rect.x0);
  const height = Math.abs(rect.y1 - rect.y0);
  ctx.fillStyle = CANVAS_COLORS.marquee;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = CANVAS_COLORS.marqueeBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}

// ---------- primitives ----------

function strokeLine(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function fillCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function strokeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

interface ScreenPoint {
  x: number;
  y: number;
}

function fillTriangle(ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  ctx.fill();
}

/** Arrow head at 60% along the edge, showing travel direction. */
function drawArrowHead(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
  const x = ax + (bx - ax) * 0.6;
  const y = ay + (by - ay) * 0.6;
  const angle = Math.atan2(by - ay, bx - ax);
  const size = 7;
  const spread = 0.45;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - spread), y - size * Math.sin(angle - spread));
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle + spread), y - size * Math.sin(angle + spread));
  ctx.stroke();
}
