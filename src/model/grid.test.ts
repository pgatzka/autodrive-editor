import { describe, expect, it } from "vitest";
import { firstLineAtOrAfter, isMajorLine, offsetForPosition, snapTo, wrapOffset } from "./grid";

describe("snapTo", () => {
  it("rounds to the nearest line of an origin-aligned grid", () => {
    expect(snapTo(3.2, 2, 0)).toBe(4);
    expect(snapTo(-3.2, 2, 0)).toBe(-4);
    expect(snapTo(1, 2, 0)).toBe(2);
  });

  it("follows the offset", () => {
    // lines at ..., -0.5, 1.5, 3.5, ...
    expect(snapTo(1.4, 2, 1.5)).toBe(1.5);
    expect(snapTo(3.4, 2, 1.5)).toBe(3.5);
    expect(snapTo(-1, 2, 1.5)).toBe(-0.5);
  });

  it("passes the value through for a degenerate grid", () => {
    expect(snapTo(3.2, 0, 0)).toBe(3.2);
    expect(snapTo(3.2, -1, 0)).toBe(3.2);
  });
});

describe("wrapOffset", () => {
  it("keeps offsets inside one grid cell", () => {
    expect(wrapOffset(5, 2)).toBe(1);
    expect(wrapOffset(2, 2)).toBe(0);
    expect(wrapOffset(0.5, 2)).toBe(0.5);
  });

  it("wraps negatives forward instead of leaving them negative", () => {
    expect(wrapOffset(-0.5, 2)).toBe(1.5);
    expect(wrapOffset(-5, 2)).toBe(1);
  });

  it("falls back to zero for unusable input", () => {
    expect(wrapOffset(1, 0)).toBe(0);
    expect(wrapOffset(Number.NaN, 2)).toBe(0);
  });
});

describe("offsetForPosition", () => {
  it("produces offsets that put a grid line through the position", () => {
    const position = { x: 123.4, z: -57.9 };
    const { offsetX, offsetZ } = offsetForPosition(position.x, position.z, 2);

    expect(snapTo(position.x, 2, offsetX)).toBeCloseTo(position.x);
    expect(snapTo(position.z, 2, offsetZ)).toBeCloseTo(position.z);
  });
});

describe("firstLineAtOrAfter", () => {
  it("finds the first line inside the view", () => {
    expect(firstLineAtOrAfter(-5.5, 2, 0)).toBe(-4);
    expect(firstLineAtOrAfter(-5.5, 2, 1.5)).toBe(-4.5);
    expect(firstLineAtOrAfter(4, 2, 0)).toBe(4);
  });
});

describe("isMajorLine", () => {
  it("emphasises every tenth line, counted from the offset", () => {
    expect(isMajorLine(0, 2, 0, 10)).toBe(true);
    expect(isMajorLine(20, 2, 0, 10)).toBe(true);
    expect(isMajorLine(18, 2, 0, 10)).toBe(false);

    // with an offset the major lines shift with the grid
    expect(isMajorLine(1.5, 2, 1.5, 10)).toBe(true);
    expect(isMajorLine(21.5, 2, 1.5, 10)).toBe(true);
    expect(isMajorLine(20, 2, 1.5, 10)).toBe(false);
  });
});
