/**
 * jsdom ships no 2D canvas implementation. The app only uses one as a carrier
 * for an already-computed raster (the pixels themselves are produced by pure
 * code that is tested directly), so a recording stub is enough and avoids a
 * native canvas dependency.
 */
const context = {
  putImageData: () => undefined,
  createImageData: (width: number, height: number) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  }),
};

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() =>
    context) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      this.data = data;
      this.width = width;
      this.height = height ?? data.length / 4 / width;
    }
  } as unknown as typeof globalThis.ImageData;
}
