import { describe, expect, it } from "vitest";
import { readFixtureBytes } from "../testing/fixtures";
import { buildBackground, nodeHeightAt, terrainHeightAt } from "./background";
import { decodeGray16Png } from "./png16";
import { parseMapTitle, parseWorldIcons } from "./savegameXml";
import { createHeightfield, heightAt, HEIGHT_SCALE } from "./terrain";
import { renderTerrainImage } from "./terrainImage";
import { dominantSurface } from "./terrainTypes";
import { buildTypePalette, parseTerrainTypeCache, TERRAIN_TYPE_MAGIC } from "./terrainTypes";
import { emptyNetwork } from "./types";

const HEIGHTMAP = readFixtureBytes("terrain.heightmap.png");
/** Ground truth from the savegame this fixture came from: placeables sit at y=128. */
const FLAT_MAP_HEIGHT = 128;

function makeTypeCache(size: number, cells: number[]): Uint8Array {
  const bytes = new Uint8Array(12 + size * size * 2);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, TERRAIN_TYPE_MAGIC, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, size, true);
  cells.forEach((type, i) => {
    bytes[12 + i * 2] = type;
    bytes[12 + i * 2 + 1] = 0xff;
  });
  return bytes;
}

describe("decodeGray16Png", () => {
  it("decodes a real savegame heightmap at full 16-bit precision", async () => {
    const image = await decodeGray16Png(HEIGHTMAP);

    expect(image.width).toBe(2049);
    expect(image.height).toBe(2049);
    // a flat map: every sample within a few millimeters of 128 m
    let min = 0xffff;
    let max = 0;
    for (const value of image.data) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    expect(min * HEIGHT_SCALE).toBeCloseTo(FLAT_MAP_HEIGHT, 1);
    expect(max * HEIGHT_SCALE).toBeCloseTo(FLAT_MAP_HEIGHT, 1);
  });

  it("rejects files that are not 16-bit grayscale PNGs", async () => {
    await expect(decodeGray16Png(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow(/Not a PNG/);
  });
});

describe("heightfield sampling", () => {
  it("interpolates between samples and reports null outside the map", () => {
    // 2x2 samples over 1 m: heights 0, 65535 along x
    const field = createHeightfield(new Uint16Array([0, 65535, 0, 65535]), 2);

    expect(heightAt(field, -0.5, -0.5)).toBeCloseTo(0);
    expect(heightAt(field, 0.5, -0.5)).toBeCloseTo(255);
    expect(heightAt(field, 0, 0)).toBeCloseTo(127.5, 1);
    expect(heightAt(field, 5, 0)).toBeNull();
  });

  it("rejects a degenerate heightfield", () => {
    expect(() => createHeightfield(new Uint16Array(1), 1)).toThrow(/too small/);
  });
});

describe("parseTerrainTypeCache", () => {
  it("reads the texture index of every cell", () => {
    const layer = parseTerrainTypeCache(makeTypeCache(2, [7, 9, 3, 7]));

    expect(layer.size).toBe(2);
    expect([...layer.types]).toEqual([7, 9, 3, 7]);
  });

  it("rejects foreign or truncated files", () => {
    expect(() => parseTerrainTypeCache(new Uint8Array(4))).toThrow(/too small/);
    expect(() => parseTerrainTypeCache(new Uint8Array(64))).toThrow(/magic/);
    const truncated = makeTypeCache(4, []).subarray(0, 20);
    expect(() => parseTerrainTypeCache(truncated)).toThrow(/truncated/);
  });
});

describe("buildTypePalette", () => {
  it("merges the dithered pair of a surface into one tone", () => {
    // the game alternates 16/17 for natural ground and 35/36 for a farmyard
    const types = new Uint8Array([16, 17, 16, 17, 16, 17, 35, 36]);

    const palette = buildTypePalette(types);

    expect(palette.get(16)).toEqual(palette.get(17));
    expect(palette.get(35)).toEqual(palette.get(36));
    expect(palette.get(35)).not.toEqual(palette.get(16));
  });

  it("gives the surface covering most of the map the grass tone", () => {
    const types = new Uint8Array([16, 16, 16, 16, 16, 35, 35]);

    const ground = buildTypePalette(types).get(16)!;

    expect(ground[1]).toBeGreaterThan(ground[0]);
    expect(ground[1]).toBeGreaterThan(ground[2]);
  });

  it("keeps surfaces apart when their indices are not adjacent", () => {
    const palette = buildTypePalette(new Uint8Array([7, 7, 20, 40]));

    expect(palette.get(20)).not.toEqual(palette.get(7));
    expect(palette.get(40)).not.toEqual(palette.get(20));
  });
});

describe("dominantSurface", () => {
  it("returns the whole dithered pair of the surface covering most ground", () => {
    const types = new Uint8Array([16, 17, 16, 17, 16, 17, 35, 36]);

    expect(dominantSurface(types)).toEqual(new Set([16, 17]));
  });

  it("is empty for an empty layer", () => {
    expect(dominantSurface(new Uint8Array())).toEqual(new Set());
  });
});

describe("renderTerrainImage", () => {
  it("uses the type layer resolution and paints every pixel opaque", () => {
    const field = createHeightfield(new Uint16Array(9).fill(32893), 3);
    const layer = parseTerrainTypeCache(makeTypeCache(2, [7, 9, 3, 7]));

    const image = renderTerrainImage(field, layer);

    expect(image.width).toBe(2);
    expect(image.pixels).toHaveLength(2 * 2 * 4);
    expect(image.pixels[3]).toBe(255);
  });

  it("paints worked ground in its own tone", () => {
    const field = createHeightfield(new Uint16Array(9).fill(32893), 3);
    const layer = parseTerrainTypeCache(makeTypeCache(2, [7, 7, 7, 7]));
    const fields = { size: 2, enclosed: new Uint8Array([0, 1, 0, 0]), cells: 1 };

    const image = renderTerrainImage(field, layer, fields);

    const pixel = (i: number) => [image.pixels[i * 4], image.pixels[i * 4 + 1], image.pixels[i * 4 + 2]];
    expect(pixel(1)).not.toEqual(pixel(0));
    // soil reads warmer than the ground it is cut out of
    expect(pixel(1)[0]).toBeGreaterThan(pixel(1)[2]);
    // and hiding fields puts the cell back to its painted colour
    const plain = renderTerrainImage(field, layer, null);
    expect([plain.pixels[4], plain.pixels[5], plain.pixels[6]]).toEqual(pixel(0));
  });

  it("falls back to an elevation tint without a type layer", () => {
    const field = createHeightfield(new Uint16Array([0, 20000, 40000, 65535]), 2);

    const image = renderTerrainImage(field, null);

    expect(image.width).toBe(2);
    // low ground renders greener than high ground
    expect(image.pixels[1] - image.pixels[0]).toBeGreaterThan(image.pixels[13] - image.pixels[12]);
  });
});

describe("savegame XML", () => {
  it("reads the map title", () => {
    expect(
      parseMapTitle("<careerSavegame><settings><mapTitle>Flat MAP</mapTitle></settings></careerSavegame>")
    ).toBe("Flat MAP");
    expect(parseMapTitle("<broken")).toBe("");
  });

  it("reads placeable positions and labels from the element itself", () => {
    const xml =
      '<placeables><placeable filename="data/placeables/mapUS/trailerHouse/trailerHouse.xml" position="-296.356 128.000 -168.160"/></placeables>';

    expect(parseWorldIcons(xml, "placeable")).toEqual([{ x: -296.356, z: -168.16, label: "trailerHouse" }]);
  });

  it("reads vehicle positions from their first component", () => {
    const xml =
      '<vehicles><vehicle filename="data/vehicles/fendt/vario900/vario900.xml"><component1 position="-287.061 127.974 -55.177"/></vehicle></vehicles>';

    expect(parseWorldIcons(xml, "vehicle")).toEqual([{ x: -287.061, z: -55.177, label: "vario900" }]);
  });

  it("skips entries without a usable position", () => {
    const xml =
      '<placeables><placeable position="1 2"/><placeable/><placeable position="a b c"/></placeables>';
    expect(parseWorldIcons(xml, "placeable")).toEqual([]);
    expect(parseWorldIcons("<broken", "placeable")).toEqual([]);
  });
});

describe("buildBackground", () => {
  it("composes terrain, title and icons from savegame files", async () => {
    const background = await buildBackground({
      heightmap: HEIGHTMAP,
      typeCache: null,
      careerXml: "<careerSavegame><mapTitle>Flat MAP</mapTitle></careerSavegame>",
      placeablesXml: '<placeables><placeable filename="a/b/silo.xml" position="10 128 20"/></placeables>',
      vehiclesXml: null,
    });

    expect(background.sizeMeters).toBe(2048);
    expect(background.mapTitle).toBe("Flat MAP");
    expect(background.placeables).toHaveLength(1);
    expect(background.hasGroundTextures).toBe(false);
    expect(terrainHeightAt(background, -296.356, -168.16)).toBeCloseTo(FLAT_MAP_HEIGHT, 1);
    expect(terrainHeightAt(background, 5000, 0)).toBeNull();
  });

  it("uses painted ground textures when the cache is present", async () => {
    const background = await buildBackground({
      heightmap: HEIGHTMAP,
      typeCache: makeTypeCache(2, [7, 9, 3, 7]),
    });
    expect(background.hasGroundTextures).toBe(true);
  });

  it("falls back to elevation rendering when the cache is unreadable", async () => {
    const background = await buildBackground({ heightmap: HEIGHTMAP, typeCache: new Uint8Array(12) });
    expect(background.hasGroundTextures).toBe(false);
  });

  it("rejects a non-square heightmap", async () => {
    // the fixture is square; a truncated PNG is the practical failure mode
    await expect(buildBackground({ heightmap: HEIGHTMAP.subarray(0, 40) })).rejects.toThrow();
  });
});

describe("nodeHeightAt", () => {
  it("prefers real terrain and falls back to neighboring nodes", async () => {
    const background = await buildBackground({ heightmap: HEIGHTMAP });
    const net = emptyNetwork();

    expect(nodeHeightAt(background, net, 10, 10)).toBeCloseTo(FLAT_MAP_HEIGHT, 1);
    // outside the map, and without a background, the nearest node decides
    expect(nodeHeightAt(background, net, 99999, 0)).toBe(0);
    expect(nodeHeightAt(null, net, 0, 0)).toBe(0);
  });
});
