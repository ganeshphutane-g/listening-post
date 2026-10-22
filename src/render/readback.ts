// Render-target readback returns rows top-down under WebGPU and bottom-up under WebGL2. WebGPU rows are
// padded to 256 bytes, and three.js leaves the last row unpadded: a w×h read is (h-1)·stride + 4w bytes
// (WebGPUTextureUtils.copyTextureToBuffer). Pack the rows into a tight top-down RGBA image with opaque
// alpha, ready for ImageData. Widths that are not a multiple of 64 px are the ones that need the stride.
export function packReadback(px: Uint8Array, w: number, h: number, bottomUp: boolean): Uint8ClampedArray {
  const tight = w * 4;
  const padded = Math.ceil(tight / 256) * 256;
  const rowBytes = px.length > h * tight ? padded : tight;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = (bottomUp ? h - 1 - y : y) * rowBytes;
    out.set(px.subarray(src, src + tight), y * tight);
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
}
