import { describe, expect, it } from 'vitest';
import { angleAboutY, throwSpeed } from '../../src/player/interaction';
import tuning from '../../content/interaction.json';

describe('angleAboutY', () => {
  it('is positive for a turn that takes +x toward -z (right-handed about +Y)', () => {
    expect(angleAboutY({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })).toBeCloseTo(Math.PI / 2, 6);
    expect(angleAboutY({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(-Math.PI / 2, 6);
    expect(angleAboutY({ x: 1, y: 0, z: 0 }, { x: 2, y: 5, z: 0 })).toBeCloseTo(0, 6);
  });
});

describe('throwSpeed', () => {
  it('rises with charge from the minimum to the maximum for the reference mass', () => {
    expect(throwSpeed(0, 1)).toBe(tuning.throw.minSpeed);
    expect(throwSpeed(1, 1)).toBe(tuning.throw.maxSpeed);
    expect(throwSpeed(2, 1)).toBe(tuning.throw.maxSpeed);
  });

  it('throws heavier things slower, lighter ones no faster than the maximum', () => {
    expect(throwSpeed(1, 4)).toBeCloseTo(tuning.throw.maxSpeed / 2, 6);
    expect(throwSpeed(1, 0.2)).toBe(tuning.throw.maxSpeed);
  });
});
