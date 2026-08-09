import { TerrainTypeLayer } from "./terrainTypes";

/**
 * Finding fields in the painted-texture layer.
 *
 * Plowing a field does not repaint the terrain: the ground inside keeps the
 * map's natural texture and only the field's edge is painted, so a field is
 * invisible in the texture layer as a filled shape. What gives it away is the
 * enclosure — a patch of natural ground that cannot be reached from the edge
 * of the map without crossing painted ground is a field, a yard, or an
 * enclosure of some other kind.
 *
 * What this cannot do is find the edge of the plowing itself. A grass margin
 * left between a field and its track is the same natural ground as the field
 * beside it, byte for byte, so it is shaded along with the field. Only the
 * savegame's plow layer knows where the worked ground actually stops.
 *
 * Maps that do paint their fields need none of this; those surfaces already
 * come out of the palette as their own colour.
 */

/** Beyond this share of the map an "enclosure" is the map itself, not a field. */
export const MAX_ENCLOSED_SHARE = 0.4;

export interface FieldAreas {
  size: number;
  /** 1 where natural ground is walled in by painted ground */
  enclosed: Uint8Array;
  /** enclosed cells, which are square meters */
  cells: number;
}

/**
 * The enclosed areas of the layer, or null when there are none worth drawing.
 * `openIndices` are the texture indices counted as unpainted ground — the
 * dominant surface of the map.
 */
export function findEnclosedAreas(layer: TerrainTypeLayer, openIndices: Set<number>): FieldAreas | null {
  const { size, types } = layer;
  const open = (i: number) => openIndices.has(types[i]);

  // reachable from outside: flood the natural ground inward from the border
  const reached = new Uint8Array(size * size);
  const stack = new Int32Array(size * size);
  let top = 0;
  const push = (i: number) => {
    if (!reached[i] && open(i)) {
      reached[i] = 1;
      stack[top++] = i;
    }
  };
  for (let n = 0; n < size; n++) {
    push(n);
    push((size - 1) * size + n);
    push(n * size);
    push(n * size + size - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const x = i % size;
    if (x > 0) push(i - 1);
    if (x < size - 1) push(i + 1);
    if (i >= size) push(i - size);
    if (i < size * (size - 1)) push(i + size);
  }

  const enclosed = new Uint8Array(size * size);
  let cells = 0;
  for (let i = 0; i < enclosed.length; i++) {
    if (open(i) && reached[i] === 0) {
      enclosed[i] = 1;
      cells++;
    }
  }
  if (cells === 0 || cells > enclosed.length * MAX_ENCLOSED_SHARE) return null;
  return { size, enclosed, cells };
}
