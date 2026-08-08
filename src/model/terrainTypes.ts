/**
 * Parser for terrain.lod.type.cache — the painted ground-texture ("floor
 * tile") layer FS25 stores inside the savegame folder: a 12-byte header
 * (magic, version, edge size), then size*size cells of 2 bytes each at one
 * cell per meter; the low byte is the terrain texture index.
 *
 * The index -> texture-name mapping lives in the map's i3d, which the
 * savegame doesn't carry, so display colors are assigned heuristically by
 * frequency: natural ground is a dithered pair of two dominant indices
 * (-> two near-identical greens that blend), painted areas (farmyards,
 * roads, dirt) are rarer and get distinct gravel/dirt/asphalt tones.
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

// frequency rank 1+2: the dithered natural-ground pair; then painted surfaces
const GROUND_PAIR: Rgb[] = [
  [88, 118, 76],
  [95, 125, 80],
];
const PAINTED: Rgb[] = [
  [150, 145, 138], // gravel
  [170, 163, 144], // concrete / sand
  [110, 91, 68], // dirt
  [98, 98, 104], // asphalt
  [154, 128, 86], // field ground
  [125, 138, 106], // rough grass
  [86, 108, 128], // water edge
  [140, 118, 140],
  [118, 140, 118],
  [160, 140, 110],
];

/** Deterministic display color per texture index, assigned by frequency rank. */
export function buildTypePalette(types: Uint8Array): Map<number, Rgb> {
  const counts = new Map<number, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const palette = new Map<number, Rgb>();
  ranked.forEach(([type], rank) => {
    if (rank < 2) palette.set(type, GROUND_PAIR[rank]);
    else palette.set(type, PAINTED[(rank - 2) % PAINTED.length]);
  });
  return palette;
}
