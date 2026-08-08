/**
 * Grid geometry. The grid can be offset on both axes, because an existing
 * road rarely sits on the origin-aligned grid — the offset is what lets a
 * player line the grid up with what is already on the map.
 */

export interface Grid {
  /** spacing in meters; 0 or less disables the grid */
  size: number;
  offsetX: number;
  offsetZ: number;
}

/** Nearest grid coordinate to `value` on an axis with this offset. */
export function snapTo(value: number, size: number, offset: number): number {
  if (size <= 0) return value;
  return Math.round((value - offset) / size) * size + offset;
}

/**
 * Offsets are equivalent modulo the grid size, so keep them in [0, size).
 * Without this, "align to waypoint" would store ever-growing numbers.
 */
export function wrapOffset(offset: number, size: number): number {
  if (size <= 0 || !Number.isFinite(offset)) return 0;
  const wrapped = offset % size;
  return round(wrapped < 0 ? wrapped + size : wrapped);
}

/** The offsets that make the grid pass exactly through a world position. */
export function offsetForPosition(x: number, z: number, size: number): { offsetX: number; offsetZ: number } {
  return { offsetX: wrapOffset(x, size), offsetZ: wrapOffset(z, size) };
}

/** First grid coordinate at or after `from`, on an axis with this offset. */
export function firstLineAtOrAfter(from: number, size: number, offset: number): number {
  return Math.ceil((from - offset) / size) * size + offset;
}

/** Grid lines are emphasised every tenth line, counted from the offset. */
export function isMajorLine(coordinate: number, size: number, offset: number, every: number): boolean {
  return Math.round((coordinate - offset) / size) % every === 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
