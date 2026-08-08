/**
 * Terrain heights from an FS25 savegame's terrain.heightmap.png.
 *
 * The heightmap holds (size + 1)² samples covering size × size meters, with
 * the world origin at the center. Raw 16-bit values map linearly to
 * 0..MAX_TERRAIN_HEIGHT meters — the engine default, which reproduces the
 * y coordinates of real savegames exactly.
 */

export const MAX_TERRAIN_HEIGHT = 255;
export const HEIGHT_SCALE = MAX_TERRAIN_HEIGHT / 65535;

export interface Heightfield {
  /** samples per edge */
  samples: number;
  /** world extent per edge, in meters */
  sizeMeters: number;
  /** row-major 16-bit height samples */
  values: Uint16Array;
}

export function createHeightfield(values: Uint16Array, samples: number): Heightfield {
  if (samples < 2 || values.length < samples * samples) {
    throw new Error(`Heightmap too small (${samples} samples, ${values.length} values)`);
  }
  return { samples, sizeMeters: samples - 1, values };
}

/** Height in meters at world (x, z) by bilinear interpolation; null outside the map. */
export function heightAt(field: Heightfield, x: number, z: number): number | null {
  const half = field.sizeMeters / 2;
  const fx = x + half;
  const fz = z + half;
  if (fx < 0 || fz < 0 || fx > field.sizeMeters || fz > field.sizeMeters) return null;

  const step = field.sizeMeters / (field.samples - 1);
  const gx = fx / step;
  const gz = fz / step;
  const x0 = Math.min(Math.floor(gx), field.samples - 2);
  const z0 = Math.min(Math.floor(gz), field.samples - 2);
  const tx = gx - x0;
  const tz = gz - z0;

  const sample = (xi: number, zi: number) => field.values[zi * field.samples + xi];
  const top = sample(x0, z0) * (1 - tx) + sample(x0 + 1, z0) * tx;
  const bottom = sample(x0, z0 + 1) * (1 - tx) + sample(x0 + 1, z0 + 1) * tx;
  return (top * (1 - tz) + bottom * tz) * HEIGHT_SCALE;
}

export interface HeightRange {
  min: number;
  max: number;
}

export function heightRange(field: Heightfield): HeightRange {
  let min = 0xffff;
  let max = 0;
  for (const v of field.values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}
