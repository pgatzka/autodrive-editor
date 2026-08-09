import { FieldAreas } from "./fields";
import { Heightfield, HEIGHT_SCALE, heightRange } from "./terrain";
import { buildTypePalette, Rgb, TerrainTypeLayer } from "./terrainTypes";

/**
 * Pure raster generation for the map background: surface color (painted
 * ground textures when available, elevation tint otherwise) modulated by
 * hillshading from the heightmap. Returns raw RGBA so it can be produced and
 * verified without a DOM canvas.
 */

export interface RgbaImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

/** Light direction (north-west, above) used for hillshading. */
const LIGHT = { x: -0.5, y: 1.2, z: -0.5 };
/** Ambient..diffuse split, so shaded slopes stay readable. */
const AMBIENT = 0.55;
const DIFFUSE = 0.45;
/** Elevation tint endpoints used when no painted-texture layer exists. */
const VALLEY: Rgb = [56, 88, 62];
const HIGHLAND: Rgb = [148, 144, 106];
/** Worked ground, told apart from the meadow it is cut out of. */
export const FIELD_TONE: Rgb = [138, 104, 68];

export function renderTerrainImage(
  field: Heightfield,
  typeLayer: TerrainTypeLayer | null,
  fields: FieldAreas | null = null
): RgbaImage {
  const size = typeLayer ? typeLayer.size : field.samples;
  const palette = typeLayer ? buildTypePalette(typeLayer.types) : null;
  const pixels = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));

  const { min, max } = heightRange(field);
  const range = Math.max(max - min, 1);
  const lightLen = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);
  // both rasters span the same world extent, so map by relative position
  const heightStep = (field.samples - 1) / Math.max(size - 1, 1);

  for (let row = 0; row < size; row++) {
    const hz = Math.min(Math.round(row * heightStep), field.samples - 1);
    for (let col = 0; col < size; col++) {
      const hx = Math.min(Math.round(col * heightStep), field.samples - 1);
      const shade = hillshade(field, hx, hz, lightLen);
      const cell = row * size + col;
      const color =
        surfaceColor(cell, typeLayer, palette, fields) ??
        elevationTint(field.values[hz * field.samples + hx], min, range);

      const offset = (row * size + col) * 4;
      pixels[offset] = color[0] * shade;
      pixels[offset + 1] = color[1] * shade;
      pixels[offset + 2] = color[2] * shade;
      pixels[offset + 3] = 255;
    }
  }
  return { width: size, height: size, pixels };
}

/** Field first, then the painted texture; null when there is no texture layer. */
function surfaceColor(
  cell: number,
  typeLayer: TerrainTypeLayer | null,
  palette: Map<number, Rgb> | null,
  fields: FieldAreas | null
): Rgb | null {
  if (fields && fields.enclosed[cell] === 1) return FIELD_TONE;
  if (!typeLayer || !palette) return null;
  return palette.get(typeLayer.types[cell]) ?? null;
}

function hillshade(field: Heightfield, x: number, z: number, lightLen: number): number {
  const at = (xi: number, zi: number) => field.values[zi * field.samples + xi];
  const last = field.samples - 1;
  const center = at(x, z);
  // ~1 m per sample, so the value delta is the slope in meters
  const dx = (at(Math.min(x + 1, last), z) - center) * HEIGHT_SCALE;
  const dz = (at(x, Math.min(z + 1, last)) - center) * HEIGHT_SCALE;
  const normalLen = Math.hypot(dx, 1, dz);
  const lambert = Math.max((-dx * LIGHT.x + LIGHT.y - dz * LIGHT.z) / (normalLen * lightLen), 0);
  return AMBIENT + DIFFUSE * lambert;
}

function elevationTint(value: number, min: number, range: number): Rgb {
  const t = (value - min) / range;
  return [
    VALLEY[0] + (HIGHLAND[0] - VALLEY[0]) * t,
    VALLEY[1] + (HIGHLAND[1] - VALLEY[1]) * t,
    VALLEY[2] + (HIGHLAND[2] - VALLEY[2]) * t,
  ];
}

/** Wrap a raster in a canvas for drawing. Only place in this module needing a DOM. */
export function toCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.putImageData(new ImageData(image.pixels, image.width, image.height), 0, 0);
  return canvas;
}
