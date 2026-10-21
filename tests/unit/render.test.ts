import { describe, expect, it } from 'vitest';
import { flipLightmapV } from '../../src/render/lightmap';
import { packReadback } from '../../src/render/readback';

describe('flipLightmapV', () => {
  it('maps v to 1 - v and flags the attribute for upload', () => {
    const ys = [0, 0.25, 1];
    const uv = { count: ys.length, getY: (i: number) => ys[i], setY: (i: number, y: number) => (ys[i] = y), needsUpdate: false };
    flipLightmapV(uv);
    expect(ys).toEqual([1, 0.75, 0]);
    expect(uv.needsUpdate).toBe(true);
  });
});

describe('packReadback', () => {
  // 1x2 image: row 0 red, row 1 blue (as stored top-down)
  const red = [255, 0, 0, 7], blue = [0, 0, 255, 7];

  it('keeps top-down rows and forces opaque alpha', () => {
    const out = packReadback(new Uint8Array([...red, ...blue]), 1, 2, false);
    expect([...out]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it('flips bottom-up rows (WebGL2)', () => {
    const out = packReadback(new Uint8Array([...blue, ...red]), 1, 2, true);
    expect([...out]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it('drops row padding (WebGPU 256-byte row alignment)', () => {
    const pad = [9, 9, 9, 9];
    const out = packReadback(new Uint8Array([...red, ...pad, ...blue, ...pad]), 1, 2, false);
    expect([...out]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });
});
