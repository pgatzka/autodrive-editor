/**
 * Minimal decoder for 16-bit grayscale PNGs — the format of FS25's
 * terrain.heightmap.png. Canvas can't be used for this: drawing a PNG onto a
 * canvas quantizes to 8 bits and destroys the height precision.
 */
export interface Gray16Image {
  width: number;
  height: number;
  /** row-major, one sample per pixel */
  data: Uint16Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function decodeGray16Png(bytes: Uint8Array): Promise<Gray16Image> {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("Not a PNG file");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const bitDepth = bytes[pos + 16];
      const colorType = bytes[pos + 17];
      const interlace = bytes[pos + 20];
      if (bitDepth !== 16 || colorType !== 0) {
        throw new Error(`Expected 16-bit grayscale PNG, got bit depth ${bitDepth}, color type ${colorType}`);
      }
      if (interlace !== 0) throw new Error("Interlaced PNGs are not supported");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (width === 0 || height === 0) throw new Error("PNG has no IHDR chunk");

  const compressed = concat(idat);
  const raw = await inflate(compressed);

  // unfilter scanlines; 2 bytes per pixel, big-endian samples
  const stride = width * 2;
  if (raw.length < height * (stride + 1)) throw new Error("PNG data truncated");
  const out = new Uint16Array(width * height);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.slice(p, p + stride);
    p += stride;
    switch (filter) {
      case 0:
        break;
      case 1:
        for (let i = 2; i < stride; i++) line[i] = (line[i] + line[i - 2]) & 0xff;
        break;
      case 2:
        for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 0xff;
        break;
      case 3:
        for (let i = 0; i < stride; i++) {
          const a = i >= 2 ? line[i - 2] : 0;
          line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let i = 0; i < stride; i++) {
          const a = i >= 2 ? line[i - 2] : 0;
          const b = prev[i];
          const c = i >= 2 ? prev[i - 2] : 0;
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          line[i] = (line[i] + pr) & 0xff;
        }
        break;
      default:
        throw new Error(`Unknown PNG filter type ${filter}`);
    }
    for (let x = 0; x < width; x++) {
      out[y * width + x] = (line[x * 2] << 8) | line[x * 2 + 1];
    }
    prev = line;
  }
  return { width, height, data: out };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function inflate(compressed: Uint8Array): Promise<Uint8Array> {
  // PNG IDAT is a zlib stream — DecompressionStream("deflate") handles the zlib wrapper
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
