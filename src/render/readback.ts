// Render-target readback returns rows top-down under WebGPU and bottom-up under WebGL2, and the
// row stride can be padded (WebGPU aligns rows to 256 bytes). Pack them into a tight top-down RGBA
// image with opaque alpha, ready for ImageData.
export function packReadback(px: Uint8Array, w: number, h: number, bottomUp: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const rowBytes = px.length / h;
  for (let y = 0; y < h; y++) {
    const src = (bottomUp ? h - 1 - y : y) * rowBytes;
    out.set(px.subarray(src, src + w * 4), y * w * 4);
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
}
