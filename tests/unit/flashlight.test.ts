import { describe, expect, it } from 'vitest';
import { Battery, batteryLevel, reflectorProfile } from '../../src/player/flashlight';
import tuning from '../../content/flashlight.json';

describe('Battery', () => {
  it('drains a full battery in 900 s of on-time (tunable), and not while off', () => {
    const b = new Battery();
    for (let i = 0; i < 600; i++) b.update(1, false);
    expect(b.charge).toBe(1);
    for (let i = 0; i < tuning.battery.drainSeconds * 60; i++) b.update(1 / 60, true);
    expect(b.charge).toBeCloseTo(0, 6);
    expect(b.empty).toBe(true);
  });
});

describe('batteryLevel', () => {
  it('is full above the low mark and dark when empty', () => {
    expect(batteryLevel(1, 0.9)).toBe(1);
    expect(batteryLevel(tuning.battery.low, 0.9)).toBe(1);
    expect(batteryLevel(0, 0)).toBe(0);
  });

  it('fades and flickers below the low mark, more as the charge falls', () => {
    const steady = batteryLevel(0.05, 0);
    expect(steady).toBeLessThan(1);
    expect(steady).toBeGreaterThan(tuning.battery.lowestIntensity);
    expect(batteryLevel(0.05, 0.9)).toBeLessThan(steady);
    expect(batteryLevel(0.01, 0.9) / batteryLevel(0.01, 0)).toBeLessThan(batteryLevel(0.12, 0.9) / batteryLevel(0.12, 0));
  });
});

describe('reflectorProfile', () => {
  it('has a hot centre, a darker ring, a brighter outer ring, and nothing outside the cone', () => {
    const centre = reflectorProfile(0), dark = reflectorProfile(0.38), ring = reflectorProfile(0.56);
    expect(centre).toBeGreaterThan(ring);
    expect(ring).toBeGreaterThan(dark);
    expect(reflectorProfile(1)).toBe(0);
    expect(reflectorProfile(1.3)).toBe(0);
    expect(reflectorProfile(0.97)).toBeLessThan(0.1);
  });
});
