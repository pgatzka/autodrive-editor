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
const BYTES_PER_SAMPLE = 2;

export async function decodeGray16Png(bytes: Uint8Array): Promise<Gray16Image> {
  assertPngSignature(bytes);
  const { width, height, idat } = readChunks(bytes);
  const raw = await inflate(idat);
  return { width, height, data: unfilter(raw, width, height) };
}

function assertPngSignature(bytes: Uint8Array): void {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("Not a PNG file");
  }
}

interface PngChunks {
  width: number;
  height: number;
  idat: Uint8Array;
}

function readChunks(bytes: Uint8Array): PngChunks {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let pos = PNG_SIGNATURE.length;

  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    if (type === "IHDR") {
      ({ width, height } = readHeader(view, bytes, pos + 8));
    } else if (type === "IDAT") {
      parts.push(bytes.subarray(pos + 8, pos + 8 + length));
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }

  if (width === 0 || height === 0) throw new Error("PNG has no IHDR chunk");
  return { width, height, idat: concat(parts) };
}

function readHeader(view: DataView, bytes: Uint8Array, offset: number): { width: number; height: number } {
  const bitDepth = bytes[offset + 8];
  const colorType = bytes[offset + 9];
  const interlace = bytes[offset + 12];
  if (bitDepth !== 16 || colorType !== 0) {
    throw new Error(`Expected 16-bit grayscale PNG, got bit depth ${bitDepth}, color type ${colorType}`);
  }
  if (interlace !== 0) throw new Error("Interlaced PNGs are not supported");
  return { width: view.getUint32(offset), height: view.getUint32(offset + 4) };
}

/** Reverse the per-scanline filters and pack the big-endian samples. */
function unfilter(raw: Uint8Array, width: number, height: number): Uint16Array {
  const stride = width * BYTES_PER_SAMPLE;
  if (raw.length < height * (stride + 1)) throw new Error("PNG data truncated");

  const out = new Uint16Array(width * height);
  let previous = new Uint8Array(stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    applyFilter(filter, line, previous, stride);

    for (let x = 0; x < width; x++) {
      out[y * width + x] = (line[x * 2] << 8) | line[x * 2 + 1];
    }
    previous = line;
  }
  return out;
}

/** PNG filter types 0..4 (none, sub, up, average, paeth). */
function applyFilter(filter: number, line: Uint8Array, previous: Uint8Array, stride: number): void {
  switch (filter) {
    case 0:
      return;
    case 1:
      for (let i = BYTES_PER_SAMPLE; i < stride; i++) line[i] = (line[i] + line[i - BYTES_PER_SAMPLE]) & 0xff;
      return;
    case 2:
      for (let i = 0; i < stride; i++) line[i] = (line[i] + previous[i]) & 0xff;
      return;
    case 3:
      for (let i = 0; i < stride; i++) {
        const left = i >= BYTES_PER_SAMPLE ? line[i - BYTES_PER_SAMPLE] : 0;
        line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < stride; i++) {
        const left = i >= BYTES_PER_SAMPLE ? line[i - BYTES_PER_SAMPLE] : 0;
        const upLeft = i >= BYTES_PER_SAMPLE ? previous[i - BYTES_PER_SAMPLE] : 0;
        line[i] = (line[i] + paeth(left, previous[i], upLeft)) & 0xff;
      }
      return;
    default:
      throw new Error(`Unknown PNG filter type ${filter}`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) return left;
  return dUp <= dUpLeft ? up : upLeft;
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

/**
 * PNG IDAT is a zlib stream, which DecompressionStream("deflate") unwraps.
 * Built from a ReadableStream rather than a Blob so it works in the browser,
 * in Electron and under Node-based test environments alike.
 */
async function inflate(compressed: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream({
    start(controller: ReadableStreamDefaultController<Uint8Array>) {
      controller.enqueue(compressed);
      controller.close();
    },
  });
  // lib.dom types the deflate stream as BufferSource in / BufferSource out
  const decompressed = source.pipeThrough(
    new DecompressionStream("deflate") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
  );
  const reader = decompressed.getReader();

  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concat(chunks);
}
