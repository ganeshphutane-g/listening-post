import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents, type SoundEvent } from '../../src/core/events';
import { VariantPicker, footstepDb, impactDb } from '../../src/audio/soundEvents';
import tuning from '../../content/sound.json';

describe('loudness table (content/sound.json)', () => {
  it('orders footsteps crouch < walk < sprint on every surface', () => {
    for (const s of Object.keys(tuning.surfaceDb) as (keyof typeof tuning.surfaceDb)[]) {
      expect(footstepDb(s, 'crouch')).toBeLessThan(footstepDb(s, 'walk'));
      expect(footstepDb(s, 'walk')).toBeLessThan(footstepDb(s, 'sprint'));
    }
  });

  it('makes metal louder than concrete and linoleum quieter, as tuned', () => {
    expect(footstepDb('concrete', 'walk')).toBe(tuning.footstepDb.walk);
    expect(footstepDb('metal', 'walk')).toBe(tuning.footstepDb.walk + tuning.surfaceDb.metal);
    expect(footstepDb('linoleum', 'walk')).toBeLessThan(footstepDb('concrete', 'walk'));
  });

  it('adds 6 dB per doubling of impulse and takes the louder surface of the pair', () => {
    const r = tuning.impact.referenceImpulse;
    expect(impactDb(r, 'concrete', 'concrete')).toBeCloseTo(tuning.impact.referenceDb, 6);
    expect(impactDb(2 * r, 'concrete', 'concrete') - impactDb(r, 'concrete', 'concrete')).toBeCloseTo(6.02, 1);
    expect(impactDb(r, 'wood', 'metal')).toBeCloseTo(tuning.impact.referenceDb + tuning.surfaceDb.metal, 6);
  });

  it('clamps very soft and very hard impacts', () => {
    expect(impactDb(1e-9, 'concrete', 'concrete')).toBe(tuning.impact.minDb);
    expect(impactDb(1e9, 'metal', 'metal')).toBe(tuning.impact.maxDb);
  });
});

describe('VariantPicker', () => {
  it('never repeats a variant twice in a row and uses all of them', () => {
    const p = new VariantPicker(42, 4);
    const seen = new Set<number>();
    let prev = 0;
    for (let i = 0; i < 200; i++) {
      const v = p.pick('step_concrete_walk');
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
      expect(v).not.toBe(prev);
      seen.add(v); prev = v;
    }
    expect(seen.size).toBe(4);
  });

  it('is deterministic for a seed', () => {
    const a = new VariantPicker(7), b = new VariantPicker(7);
    expect(Array.from({ length: 20 }, () => a.pick('k'))).toEqual(Array.from({ length: 20 }, () => b.pick('k')));
  });
});

describe('EventBus', () => {
  it('delivers events to subscribers until they unsubscribe', () => {
    const bus = new EventBus<GameEvents>();
    const got: SoundEvent[] = [];
    const off = bus.on('sound', (e) => got.push(e));
    const e: SoundEvent = { kind: 'footstep', position: { x: 0, y: 0, z: 0 }, loudnessDb: 54, surface: 'concrete', sound: 'step_concrete_walk_1', source: 'player', time: 0 };
    bus.emit('sound', e);
    off();
    bus.emit('sound', e);
    expect(got).toHaveLength(1);
  });
});
