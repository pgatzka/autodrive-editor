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
  /** cells per chunk — every Nth line is emphasised */
  majorEvery: number;
}

/** Cells per chunk when nothing else is stored — the value FS25 maps tend to use. */
export const DEFAULT_MAJOR_EVERY = 10;

/** Nearest grid coordinate to `value` on an axis with this offset. */
export function snapTo(value: number, size: number, offset: number): number {
  if (size <= 0) return value;
  return Math.round((value - offset) / size) * size + offset;
}

/**
 * Offsets are equivalent modulo the grid size, so a computed one is reduced to
 * the smallest equivalent. Only used for values the app derives — a typed
 * offset is kept exactly as entered, because wrapping it would silently turn
 * "2" into "0" on a 0.5 m grid and look like the field refusing input.
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
