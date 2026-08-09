import { describe, expect, it } from "vitest";
import { findEnclosedAreas, MAX_ENCLOSED_SHARE } from "./fields";
import { TerrainTypeLayer } from "./terrainTypes";

const GRASS = 16;
const PAINTED = 21;
const OPEN = new Set([GRASS]);

/** A layer of grass with painted cells wherever `paint` reports true. */
function layer(size: number, paint: (x: number, z: number) => boolean): TerrainTypeLayer {
  const types = new Uint8Array(size * size).fill(GRASS);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (paint(x, z)) types[z * size + x] = PAINTED;
    }
  }
  return { size, types };
}

/** A closed painted border between the given bounds, as plowing leaves behind. */
function ring(x0: number, x1: number, z0: number, z1: number) {
  return (x: number, z: number) =>
    x >= x0 && x <= x1 && z >= z0 && z <= z1 && (x === x0 || x === x1 || z === z0 || z === z1);
}

describe("findEnclosedAreas", () => {
  it("finds the ground a painted border walls in", () => {
    const areas = findEnclosedAreas(layer(20, ring(4, 9, 4, 9)), OPEN);

    // the 6x6 ring encloses 4x4 of grass
    expect(areas?.cells).toBe(16);
    expect(areas!.enclosed[6 * 20 + 6]).toBe(1);
    expect(areas!.enclosed[4 * 20 + 4]).toBe(0); // the border itself is not field
    expect(areas!.enclosed[0]).toBe(0); // nor the meadow outside
  });

  it("finds several fields at once", () => {
    const two = (x: number, z: number) => ring(2, 7, 2, 7)(x, z) || ring(12, 17, 12, 17)(x, z);

    expect(findEnclosedAreas(layer(20, two), OPEN)?.cells).toBe(32);
  });

  it("ignores a border with a gap, which walls nothing in", () => {
    const leaky = (x: number, z: number) => ring(4, 9, 4, 9)(x, z) && !(x === 6 && z === 4);

    expect(findEnclosedAreas(layer(20, leaky), OPEN)).toBeNull();
  });

  it("has nothing to report on a map with no painted ground", () => {
    expect(
      findEnclosedAreas(
        layer(20, () => false),
        OPEN
      )
    ).toBeNull();
  });

  it("keeps out of the way when the enclosure is most of the map", () => {
    // a border right around the edge would otherwise declare the whole map a field
    const areas = findEnclosedAreas(layer(20, ring(1, 18, 1, 18)), OPEN);

    expect(areas).toBeNull();
    expect(MAX_ENCLOSED_SHARE).toBeLessThan(1);
  });

  it("counts a field cut in half by a shared border as one area", () => {
    // fields drawn next to each other share their border, as they do in game
    const split = (x: number, z: number) => (ring(2, 17, 2, 17)(x, z) || z === 10) && x <= 17 && z <= 17;
    const areas = findEnclosedAreas(layer(40, split), OPEN)!;

    // the 14x14 interior minus the row the dividing border takes
    expect(areas.cells).toBe(14 * 14 - 14);
    expect(areas.enclosed[5 * 40 + 5]).toBe(1);
    expect(areas.enclosed[15 * 40 + 5]).toBe(1);
    expect(areas.enclosed[10 * 40 + 5]).toBe(0);
  });

  it("treats every index of the dithered ground pair as open", () => {
    const size = 20;
    const types = new Uint8Array(size * size);
    // the game dithers natural ground between two neighbouring slots
    for (let i = 0; i < types.length; i++) types[i] = i % 2 === 0 ? 16 : 17;
    for (let z = 4; z <= 9; z++) {
      for (let x = 4; x <= 9; x++) {
        if (x === 4 || x === 9 || z === 4 || z === 9) types[z * size + x] = PAINTED;
      }
    }

    expect(findEnclosedAreas({ size, types }, new Set([16, 17]))?.cells).toBe(16);
    // seeing only half the dither fences every other cell off as its own patch
    expect(findEnclosedAreas({ size, types }, new Set([16]))?.cells).not.toBe(16);
  });
});
