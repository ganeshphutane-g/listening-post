import { describe, expect, it } from 'vitest';
import { updateStamina } from '../../src/player/controller';
import tuning from '../../content/player.json';

describe('updateStamina', () => {
  it('empties a full bar after the tuned sprint time', () => {
    let s = 1;
    for (let i = 0; i < tuning.stamina.seconds * 60; i++) s = updateStamina(s, 0, true, 1 / 60);
    expect(s).toBeCloseTo(0, 5);
  });

  it('waits for the regen delay, then refills at the tuned rate', () => {
    expect(updateStamina(0.5, tuning.stamina.regenDelay - 0.1, false, 1)).toBe(0.5);
    expect(updateStamina(0.5, tuning.stamina.regenDelay + 0.1, false, 1)).toBeCloseTo(0.5 + tuning.stamina.regenPerSecond, 5);
    expect(updateStamina(0.99, 10, false, 1)).toBe(1);
  });
});
