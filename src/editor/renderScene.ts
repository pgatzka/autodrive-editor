import { SavegameBackground } from "../model/background";
import { firstLineAtOrAfter, Grid, isMajorLine } from "../model/grid";
import { allEdges } from "../model/graph";
import { ConnectionMode, FLAG_SUBPRIO, RouteNetwork } from "../model/types";
import { BLUEPRINT_ORIGIN } from "../state/blueprintSession";
import { EditorState } from "../state/store";
import { fillCircle, ScreenPoint, strokeCircle, strokeLine } from "./canvasPrimitives";
import { drawAnchor, drawGhost, drawMarkers, drawRubberBand, drawWorldIcons } from "./renderAnnotations";
import {
  CANVAS_COLORS,
  casingWidth,
  chevronSpacing,
  CONNECTION_COLORS,
  linkWidth,
  MAJOR_GRID_EVERY,
  MIN_GRID_SPACING_PX,
  MIN_SMOOTHING_SCALE,
  nodeRadius,
  ZOOM,
} from "./theme";
import { Viewport } from "./viewport";

/**
 * The network layers, composed by `renderScene` in paint order. Implements
 * "Grammar B — cased": every link sits on a dark casing so it reads over any
 * terrain, and states differ in shape (ring / square / filled, chevrons /
 * plain / double dash) so colour is never the only channel.
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

interface LinkStyle {
  kind: ConnectionMode;
  width: number;
  scale: number;
  condemned: boolean;
}

interface NodeState {
  selected: boolean;
  condemned: boolean;
  subprio: boolean;
  pending: boolean;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  viewport: Viewport,
  overlays: SceneOverlays
): void {
  const blueprintMode = state.blueprintEdit !== null;

  drawField(ctx, viewport, blueprintMode);
  if (state.background && !blueprintMode) {
    drawTerrain(ctx, viewport, state.background, state.settings.backgroundOpacity);
  }
  drawGrid(ctx, viewport, gridOf(state), blueprintMode);
  if (state.background && !blueprintMode && state.settings.showIcons) {
    drawWorldIcons(ctx, viewport, state.background);
  }
  drawLinks(ctx, viewport, state);
  drawPendingConnection(ctx, viewport, state, overlays.cursor);
  if (blueprintMode) drawAnchor(ctx, viewport, BLUEPRINT_ORIGIN);
  drawNodes(ctx, viewport, state);
  drawMarkers(ctx, viewport, state.network);
  if (state.placement && overlays.cursor) {
    drawGhost(ctx, viewport, state.placement.blueprint, state.placement.rotation, overlays.cursor);
  }
  if (overlays.marquee) drawRubberBand(ctx, overlays.marquee);
}

/** The grid the canvas draws, taken straight from settings. */
function gridOf(state: EditorState): Grid {
  return {
    size: state.settings.gridSize,
    offsetX: state.settings.gridOffsetX,
    offsetZ: state.settings.gridOffsetZ,
  };
}

function drawField(ctx: CanvasRenderingContext2D, viewport: Viewport, blueprintMode: boolean): void {
  ctx.fillStyle = blueprintMode ? CANVAS_COLORS.fieldBlueprint : CANVAS_COLORS.field;
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
  // The terrain raster is one texel per metre. Smoothing it while magnifying
  // (scale > 1 px/m) blurs the painted tiles, so interpolate only when
  // minifying, where it stops the ground dithering from aliasing.
  ctx.imageSmoothingEnabled = viewport.scale < MIN_SMOOTHING_SCALE;
  ctx.drawImage(
    background.canvas,
    viewport.toScreenX(-half),
    viewport.toScreenY(-half),
    background.sizeMeters * viewport.scale,
    background.sizeMeters * viewport.scale
  );
  ctx.globalAlpha = 1;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  grid: Grid,
  blueprintMode: boolean
): void {
  if (grid.size <= 0) return;
  const minorVisible = grid.size * viewport.scale >= MIN_GRID_SPACING_PX;
  const majorVisible = grid.size * viewport.scale * MAJOR_GRID_EVERY >= MIN_GRID_SPACING_PX;
  if (!majorVisible) return;

  const minor = blueprintMode ? CANVAS_COLORS.gridMinorBlueprint : CANVAS_COLORS.gridMinor;
  const major = blueprintMode ? CANVAS_COLORS.gridMajorBlueprint : CANVAS_COLORS.gridMajor;
  // when minor lines are too dense to read, only every tenth line is drawn
  const step = minorVisible ? grid.size : grid.size * MAJOR_GRID_EVERY;
  ctx.lineWidth = 1;

  const maxX = viewport.toWorldX(viewport.width);
  for (let x = firstLineAtOrAfter(viewport.toWorldX(0), step, grid.offsetX); x <= maxX; x += step) {
    ctx.strokeStyle = isMajorLine(x, grid.size, grid.offsetX, MAJOR_GRID_EVERY) ? major : minor;
    const sx = Math.round(viewport.toScreenX(x)) + 0.5;
    strokeLine(ctx, sx, 0, sx, viewport.height);
  }
  const maxZ = viewport.toWorldZ(viewport.height);
  for (let z = firstLineAtOrAfter(viewport.toWorldZ(0), step, grid.offsetZ); z <= maxZ; z += step) {
    ctx.strokeStyle = isMajorLine(z, grid.size, grid.offsetZ, MAJOR_GRID_EVERY) ? major : minor;
    const sy = Math.round(viewport.toScreenY(z)) + 0.5;
    strokeLine(ctx, 0, sy, viewport.width, sy);
  }
}

// ---------- links ----------

function drawLinks(ctx: CanvasRenderingContext2D, viewport: Viewport, state: EditorState): void {
  const edges = allEdges(state.network);
  const width = linkWidth(viewport.scale);
  const doomed = state.pendingDeletion;

  // casing pass first, so neighbouring links never cut into each other
  ctx.strokeStyle = CANVAS_COLORS.linkCasing;
  ctx.lineWidth = casingWidth(viewport.scale);
  ctx.lineCap = "round";
  for (const edge of edges) {
    const segment = screenSegment(viewport, state.network, edge.from, edge.to);
    if (segment) strokeLine(ctx, segment.a.x, segment.a.y, segment.b.x, segment.b.y);
  }
  ctx.lineCap = "butt";

  for (const edge of edges) {
    const segment = screenSegment(viewport, state.network, edge.from, edge.to);
    if (!segment) continue;
    const condemned = doomed !== null && doomed.has(edge.from) && doomed.has(edge.to);
    drawLink(ctx, segment.a, segment.b, { kind: edge.kind, width, scale: viewport.scale, condemned });
  }
}

function drawLink(ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint, style: LinkStyle): void {
  const { kind, width, scale, condemned } = style;
  ctx.strokeStyle = condemned ? CANVAS_COLORS.danger : CONNECTION_COLORS[kind];

  if (kind === "reverse") {
    drawReverseRails(ctx, a, b, width, scale);
    return;
  }
  ctx.lineWidth = kind === "dual" ? width * 1.15 : width;
  strokeLine(ctx, a.x, a.y, b.x, b.y);
  if (kind === "oneway" && scale > ZOOM.chevrons) {
    drawChevrons(ctx, a, b, width, scale);
  }
}

/** Reverse links are a double dashed rail, collapsing to one when zoomed out. */
function drawReverseRails(
  ctx: CanvasRenderingContext2D,
  a: ScreenPoint,
  b: ScreenPoint,
  width: number,
  scale: number
): void {
  const dash = 1.6 * width;
  ctx.lineWidth = width;
  ctx.setLineDash([dash, dash]);
  if (scale < ZOOM.reverseDoubleRail) {
    strokeLine(ctx, a.x, a.y, b.x, b.y);
  } else {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / length) * (width * 0.75);
    const ny = ((b.x - a.x) / length) * (width * 0.75);
    strokeLine(ctx, a.x + nx, a.y + ny, b.x + nx, b.y + ny);
    strokeLine(ctx, a.x - nx, a.y - ny, b.x - nx, b.y - ny);
  }
  ctx.setLineDash([]);
}

/** Direction is carried by repeated chevrons, not a single midpoint arrow. */
function drawChevrons(
  ctx: CanvasRenderingContext2D,
  a: ScreenPoint,
  b: ScreenPoint,
  width: number,
  scale: number
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const spacing = chevronSpacing(scale);
  if (length < spacing) return;

  const ux = dx / length;
  const uy = dy / length;
  const size = Math.max(3.5, width * 2);
  ctx.lineWidth = Math.max(1, width * 0.9);
  ctx.lineCap = "round";
  for (let distance = spacing / 2; distance < length; distance += spacing) {
    const x = a.x + ux * distance;
    const y = a.y + uy * distance;
    ctx.beginPath();
    ctx.moveTo(x - ux * size - uy * size * 0.6, y - uy * size + ux * size * 0.6);
    ctx.lineTo(x, y);
    ctx.lineTo(x - ux * size + uy * size * 0.6, y - uy * size - ux * size * 0.6);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
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

  ctx.strokeStyle = CANVAS_COLORS.pending;
  ctx.lineWidth = 1.5;
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

// ---------- nodes ----------

function drawNodes(ctx: CanvasRenderingContext2D, viewport: Viewport, state: EditorState): void {
  const radius = nodeRadius(viewport.scale);
  const ringLegible = radius >= 2.6 && viewport.scale >= ZOOM.ringLegible;

  for (const waypoint of state.network.waypoints.values()) {
    const at = { x: viewport.toScreenX(waypoint.x), y: viewport.toScreenY(waypoint.z) };
    if (!viewport.isVisible(at.x, at.y)) continue;

    drawNode(ctx, at, radius, ringLegible, {
      selected: state.selection.has(waypoint.id),
      condemned: state.pendingDeletion?.has(waypoint.id) ?? false,
      subprio: (waypoint.flags & FLAG_SUBPRIO) !== 0,
      pending: waypoint.id === state.pendingConnectFrom,
    });
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  at: ScreenPoint,
  radius: number,
  ringLegible: boolean,
  node: NodeState
): void {
  ctx.fillStyle = nodeFill(node);

  // shape carries the meaning: subprio is a square, everything else a disc
  if (node.subprio) {
    const side = radius * 1.8;
    ctx.fillRect(at.x - side / 2, at.y - side / 2, side, side);
  } else {
    fillCircle(ctx, at.x, at.y, radius);
    if (ringLegible && !node.selected && !node.condemned) {
      // a ring rather than a disc, so overlapping nodes stay countable
      ctx.fillStyle = CANVAS_COLORS.nodeCore;
      fillCircle(ctx, at.x, at.y, radius * 0.5);
    }
  }

  if (node.selected || node.condemned) {
    ctx.strokeStyle = node.condemned ? CANVAS_COLORS.danger : CANVAS_COLORS.nodeSelected;
    ctx.lineWidth = 1.5;
    strokeCircle(ctx, at.x, at.y, radius + 3.5);
  }
  if (node.pending) {
    ctx.strokeStyle = CANVAS_COLORS.pending;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    strokeCircle(ctx, at.x, at.y, Math.max(radius + 7, 9));
    ctx.setLineDash([]);
  }
}

function nodeFill(node: NodeState): string {
  if (node.condemned) return CANVAS_COLORS.danger;
  if (node.selected) return CANVAS_COLORS.nodeSelected;
  return node.subprio ? CANVAS_COLORS.nodeSubprio : CANVAS_COLORS.node;
}

// ---------- savegame world icons ----------

// ---------- overlays ----------

function screenSegment(
  viewport: Viewport,
  network: RouteNetwork,
  fromId: number,
  toId: number
): { a: ScreenPoint; b: ScreenPoint } | null {
  const from = network.waypoints.get(fromId);
  const to = network.waypoints.get(toId);
  if (!from || !to) return null;
  const a = { x: viewport.toScreenX(from.x), y: viewport.toScreenY(from.z) };
  const b = { x: viewport.toScreenX(to.x), y: viewport.toScreenY(to.z) };
  if (!viewport.isVisible(a.x, a.y) && !viewport.isVisible(b.x, b.y)) return null;
  return { a, b };
}
