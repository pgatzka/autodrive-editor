import { RouteNetwork } from "./types";
import { estimateY } from "./graph";
import { decodeGray16Png } from "./png16";
import { buildTypePalette, parseTerrainTypeCache, TerrainTypeLayer } from "./terrainTypes";

/**
 * Map background rendered from files inside an FS25 savegame folder:
 *  - terrain.heightmap.png  (16-bit grayscale, (size+1) samples over `size` meters)
 *  - careerSavegame.xml     (map title)
 *  - placeables.xml / vehicles.xml (world positions for icons)
 *
 * FS terrain heights map 0..65535 -> 0..255 meters by default; that scale
 * reproduces the placeable/waypoint y values of real savegames exactly.
 */

export const HEIGHT_SCALE = 255 / 65535;

export interface WorldIcon {
  x: number;
  z: number;
  label: string;
}

export interface SavegameBackground {
  canvas: HTMLCanvasElement;
  /** world size covered by the canvas, in meters (origin at the center) */
  sizeMeters: number;
  mapTitle: string;
  heights: Uint16Array;
  samples: number;
  placeables: WorldIcon[];
  vehicles: WorldIcon[];
}

export interface BackgroundFiles {
  heightmap: Uint8Array;
  /** terrain.lod.type.cache — the painted ground-texture layer */
  typeCache?: Uint8Array | null;
  careerXml?: string | null;
  placeablesXml?: string | null;
  vehiclesXml?: string | null;
}

export async function buildBackground(files: BackgroundFiles): Promise<SavegameBackground> {
  const img = await decodeGray16Png(files.heightmap);
  if (img.width !== img.height) throw new Error(`Heightmap is not square (${img.width}x${img.height})`);
  const samples = img.width;
  const sizeMeters = samples - 1;

  let typeLayer: TerrainTypeLayer | null = null;
  if (files.typeCache && files.typeCache.length > 0) {
    try {
      typeLayer = parseTerrainTypeCache(files.typeCache);
    } catch {
      typeLayer = null; // fall back to pure hillshade
    }
  }

  return {
    canvas: renderTerrain(img.data, samples, typeLayer),
    sizeMeters,
    mapTitle: files.careerXml ? parseMapTitle(files.careerXml) : "",
    heights: img.data,
    samples,
    placeables: files.placeablesXml ? parsePositionsXml(files.placeablesXml, "placeable") : [],
    vehicles: files.vehiclesXml ? parsePositionsXml(files.vehiclesXml, "vehicle") : [],
  };
}

/** Terrain height in meters at world (x, z), bilinear; null outside the map. */
export function terrainHeightAt(bg: SavegameBackground, x: number, z: number): number | null {
  const half = bg.sizeMeters / 2;
  const fx = x + half;
  const fz = z + half;
  if (fx < 0 || fz < 0 || fx > bg.sizeMeters || fz > bg.sizeMeters) return null;
  const step = bg.sizeMeters / (bg.samples - 1);
  const gx = fx / step;
  const gz = fz / step;
  const x0 = Math.min(Math.floor(gx), bg.samples - 2);
  const z0 = Math.min(Math.floor(gz), bg.samples - 2);
  const tx = gx - x0;
  const tz = gz - z0;
  const h = (xi: number, zi: number) => bg.heights[zi * bg.samples + xi];
  const top = h(x0, z0) * (1 - tx) + h(x0 + 1, z0) * tx;
  const bottom = h(x0, z0 + 1) * (1 - tx) + h(x0 + 1, z0 + 1) * tx;
  return (top * (1 - tz) + bottom * tz) * HEIGHT_SCALE;
}

/** Height for a new node: real terrain when a background is loaded, else nearest existing node. */
export function nodeHeightAt(bg: SavegameBackground | null, net: RouteNetwork, x: number, z: number): number {
  if (bg) {
    const h = terrainHeightAt(bg, x, z);
    if (h !== null) return Math.round(h * 1000) / 1000;
  }
  return estimateY(net, x, z);
}

function renderTerrain(heights: Uint16Array, samples: number, typeLayer: TerrainTypeLayer | null): HTMLCanvasElement {
  const size = typeLayer ? typeLayer.size : samples;
  const palette = typeLayer ? buildTypePalette(typeLayer.types) : null;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const px = img.data;

  let min = 0xffff;
  let max = 0;
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < min) min = heights[i];
    if (heights[i] > max) max = heights[i];
  }
  const range = Math.max(max - min, 1);

  // elevation tint fallback when no type layer exists: valley green -> highland tan
  const low = [56, 88, 62];
  const high = [148, 144, 106];
  // light from the north-west
  const lx = -0.5;
  const lz = -0.5;
  const ly = 1.2;
  const llen = Math.hypot(lx, ly, lz);
  // canvas pixel -> heightmap sample (both cover the same world extent)
  const hmStep = (samples - 1) / Math.max(size - 1, 1);

  for (let z = 0; z < size; z++) {
    const hz = Math.min(Math.round(z * hmStep), samples - 1);
    for (let x = 0; x < size; x++) {
      const hx = Math.min(Math.round(x * hmStep), samples - 1);
      const hC = heights[hz * samples + hx];
      const hX = heights[hz * samples + Math.min(hx + 1, samples - 1)];
      const hZ = heights[Math.min(hz + 1, samples - 1) * samples + hx];
      // ~1 m per sample; slope in meters
      const dx = (hX - hC) * HEIGHT_SCALE;
      const dz = (hZ - hC) * HEIGHT_SCALE;
      const nlen = Math.hypot(dx, 1, dz);
      const lambert = Math.max((-dx * lx + ly - dz * lz) / (nlen * llen), 0);
      const shade = 0.55 + 0.45 * lambert;

      let r: number;
      let g: number;
      let b: number;
      if (typeLayer && palette) {
        const color = palette.get(typeLayer.types[z * typeLayer.size + x])!;
        r = color[0];
        g = color[1];
        b = color[2];
      } else {
        const t = (hC - min) / range;
        r = low[0] + (high[0] - low[0]) * t;
        g = low[1] + (high[1] - low[1]) * t;
        b = low[2] + (high[2] - low[2]) * t;
      }
      const o = (z * size + x) * 4;
      px[o] = Math.min(255, r * shade);
      px[o + 1] = Math.min(255, g * shade);
      px[o + 2] = Math.min(255, b * shade);
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function parseMapTitle(careerXml: string): string {
  const doc = new DOMParser().parseFromString(careerXml, "application/xml");
  return doc.querySelector("mapTitle")?.textContent?.trim() ?? "";
}

/**
 * Extract world icons from placeables.xml / vehicles.xml. Placeables carry
 * position="x y z" on the element itself; vehicles carry it on a child
 * (their first component), so fall back to the first positioned descendant.
 */
export function parsePositionsXml(text: string, tagName: string): WorldIcon[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  const icons: WorldIcon[] = [];
  for (const el of Array.from(doc.getElementsByTagName(tagName))) {
    const positioned = el.hasAttribute("position") ? el : el.querySelector("[position]");
    const parts = (positioned?.getAttribute("position") ?? "").trim().split(/\s+/).map(Number);
    if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) continue;
    const filename = el.getAttribute("filename") ?? "";
    const base = filename.split("/").pop()?.replace(/\.xml$/i, "") ?? "";
    icons.push({ x: parts[0], z: parts[2], label: el.getAttribute("name") ?? base });
  }
  return icons;
}
