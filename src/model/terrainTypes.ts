/**
 * Parser for terrain.lod.type.cache — the painted ground-texture ("floor
 * tile") layer FS25 stores inside the savegame folder: a 12-byte header
 * (magic, version, edge size), then size*size cells of 2 bytes each at one
 * cell per meter; the low byte is the terrain texture index.
 *
 * The index -> texture-name mapping lives in the map's i3d, which the
 * savegame doesn't carry, so display colours are assigned heuristically.
 */

export const TERRAIN_TYPE_MAGIC = 0x10dcac66;

export interface TerrainTypeLayer {
  /** edge length in cells (= meters) */
  size: number;
  /** row-major texture index per cell */
  types: Uint8Array;
}

export function parseTerrainTypeCache(bytes: Uint8Array): TerrainTypeLayer {
  if (bytes.length < 12) throw new Error("terrain type cache too small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== TERRAIN_TYPE_MAGIC) {
    throw new Error(`Unexpected terrain type cache magic 0x${magic.toString(16)}`);
  }
  const size = view.getUint32(8, true);
  if (size === 0 || size > 16384 || bytes.length < 12 + size * size * 2) {
    throw new Error(`Terrain type cache truncated (size ${size}, ${bytes.length} bytes)`);
  }
  const types = new Uint8Array(size * size);
  for (let i = 0; i < types.length; i++) {
    types[i] = bytes[12 + i * 2];
  }
  return { size, types };
}

export type Rgb = [number, number, number];

/** Surface tones, applied in order of how much of the map each surface covers. */
const SURFACE_TONES: Rgb[] = [
  [92, 122, 78], // grass / natural ground
  [150, 145, 138], // gravel
  [170, 163, 144], // concrete, sand
  [110, 91, 68], // dirt
  [98, 98, 104], // asphalt
  [154, 128, 86], // field ground
  [125, 138, 106], // rough grass
  [86, 108, 128], // water edge
  [140, 118, 140],
  [118, 140, 118],
];

/**
 * A display colour per texture index.
 *
 * The game dithers a surface between neighbouring texture slots — natural
 * ground alternates 16/17, a farmyard 35/36 — so colouring each index
 * separately turns every surface into checkerboard noise once the view is
 * zoomed in. Runs of consecutive indices are therefore treated as one
 * surface and share a tone, which is also how they read in game.
 */
export function buildTypePalette(types: Uint8Array): Map<number, Rgb> {
  const counts = countIndices(types);
  const surfaces = groupConsecutive(Array.from(counts.keys()));

  // biggest surface first, so the dominant ground gets the grass tone
  surfaces.sort((a, b) => coverage(b, counts) - coverage(a, counts));

  const palette = new Map<number, Rgb>();
  surfaces.forEach((surface, rank) => {
    const tone = SURFACE_TONES[rank % SURFACE_TONES.length];
    for (const index of surface) palette.set(index, tone);
  });
  return palette;
}

function countIndices(types: Uint8Array): Map<number, number> {
  const counts = new Map<number, number>();
  for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);
  return counts;
}

/** [16, 17, 35, 36, 90] -> [[16, 17], [35, 36], [90]] */
function groupConsecutive(indices: number[]): number[][] {
  const sorted = indices.slice().sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const index of sorted) {
    const current = groups.length > 0 ? groups[groups.length - 1] : null;
    if (current && index - current[current.length - 1] === 1) current.push(index);
    else groups.push([index]);
  }
  return groups;
}

function coverage(surface: number[], counts: Map<number, number>): number {
  return surface.reduce((sum, index) => sum + (counts.get(index) ?? 0), 0);
}
