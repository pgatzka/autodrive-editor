import { estimateY } from "./graph";
import { decodeGray16Png } from "./png16";
import { parseMapTitle, parseWorldIcons, WorldIcon } from "./savegameXml";
import { createHeightfield, Heightfield, heightAt } from "./terrain";
import { renderTerrainImage, toCanvas } from "./terrainImage";
import { parseTerrainTypeCache, TerrainTypeLayer } from "./terrainTypes";
import { RouteNetwork } from "./types";

/**
 * Composes the map background from the files of an FS25 savegame folder:
 * terrain heights, painted ground textures, and world object positions.
 * Each part is parsed by its own module; this one only wires them together.
 */

/** Raw file contents as read from a savegame folder. */
export interface BackgroundFiles {
  heightmap: Uint8Array;
  /** terrain.lod.type.cache — painted ground textures */
  typeCache?: Uint8Array | null;
  careerXml?: string | null;
  placeablesXml?: string | null;
  vehiclesXml?: string | null;
}

export interface SavegameBackground {
  canvas: HTMLCanvasElement;
  field: Heightfield;
  /** world extent per edge, in meters (origin at the center) */
  sizeMeters: number;
  mapTitle: string;
  placeables: WorldIcon[];
  vehicles: WorldIcon[];
  /** true when painted ground textures were available */
  hasGroundTextures: boolean;
}

export async function buildBackground(files: BackgroundFiles): Promise<SavegameBackground> {
  const image = await decodeGray16Png(files.heightmap);
  if (image.width !== image.height) {
    throw new Error(`Heightmap is not square (${image.width}x${image.height})`);
  }
  const field = createHeightfield(image.data, image.width);
  const typeLayer = readTypeLayer(files.typeCache);

  return {
    canvas: toCanvas(renderTerrainImage(field, typeLayer)),
    field,
    sizeMeters: field.sizeMeters,
    mapTitle: files.careerXml ? parseMapTitle(files.careerXml) : "",
    placeables: files.placeablesXml ? parseWorldIcons(files.placeablesXml, "placeable") : [],
    vehicles: files.vehiclesXml ? parseWorldIcons(files.vehiclesXml, "vehicle") : [],
    hasGroundTextures: typeLayer !== null,
  };
}

/** Terrain height in meters at world (x, z); null outside the map. */
export function terrainHeightAt(background: SavegameBackground, x: number, z: number): number | null {
  return heightAt(background.field, x, z);
}

/** Height for a new node: real terrain when a background is loaded, else nearest existing node. */
export function nodeHeightAt(
  background: SavegameBackground | null,
  net: RouteNetwork,
  x: number,
  z: number
): number {
  if (background) {
    const height = terrainHeightAt(background, x, z);
    if (height !== null) return Math.round(height * 1000) / 1000;
  }
  return estimateY(net, x, z);
}

/** An unreadable cache is not fatal — the background falls back to elevation tinting. */
function readTypeLayer(bytes: Uint8Array | null | undefined): TerrainTypeLayer | null {
  if (!bytes || bytes.length === 0) return null;
  try {
    return parseTerrainTypeCache(bytes);
  } catch {
    return null;
  }
}

export type { WorldIcon };
