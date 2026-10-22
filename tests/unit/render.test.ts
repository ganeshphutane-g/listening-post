import { describe, expect, it } from 'vitest';
import { packReadback } from '../../src/render/readback';

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

  it('drops WebGPU row padding when the last row is unpadded (three.js layout)', () => {
    // 1 px wide: rows are padded from 4 to 256 bytes, except the last; a 2225 px wide read striped without this
    const pad = new Array(252).fill(9);
    const out = packReadback(new Uint8Array([...red, ...pad, ...blue]), 1, 2, false);
    expect([...out]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it('drops WebGPU row padding when every row is padded', () => {
    const pad = new Array(252).fill(9);
    const out = packReadback(new Uint8Array([...red, ...pad, ...blue, ...pad]), 1, 2, false);
    expect([...out]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });
});
