import { describe, expect, it } from 'vitest';
import { ACTIONS, DEFAULT_BINDINGS, DEFAULT_SETTINGS, actionsByCode, loadSettings, mergeSettings, rebind, saveSettings } from '../../src/core/settings';
import { applyDeadzone, mouseToLook } from '../../src/player/input';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('default bindings (MASTER_PLAN §3.8)', () => {
  it('map WASD, flashlight, scanner and journal, and never bind a key twice', () => {
    const by = actionsByCode(DEFAULT_BINDINGS);
    expect(by.get('KeyW')).toEqual(['moveForward']);
    expect(by.get('KeyF')).toEqual(['flashlight']);
    expect(by.get('KeyR')).toEqual(['scanner']);
    expect(by.get('Tab')).toEqual(['journal']);
    expect(by.get('Mouse0')).toEqual(['interact']);
    expect(by.get('Mouse2')).toEqual(['throw']); // right button (MouseEvent.button 2), not the middle one
    for (const actions of by.values()) expect(actions).toHaveLength(1);
  });
});

describe('rebind', () => {
  it('swaps when the new key belongs to another action, so nothing is bound twice or lost', () => {
    const b = rebind(DEFAULT_BINDINGS, 'flashlight', 0, 'KeyR'); // R was the scanner
    expect(b.flashlight[0]).toBe('KeyR');
    expect(b.scanner[0]).toBe('KeyF');
    for (const actions of actionsByCode(b).values()) expect(actions).toHaveLength(1);
  });

  it('clears a slot with an empty code and refuses Escape', () => {
    expect(rebind(DEFAULT_BINDINGS, 'moveForward', 1, '').moveForward).toEqual(['KeyW', '']);
    expect(() => rebind(DEFAULT_BINDINGS, 'journal', 0, 'Escape')).toThrow();
  });

  it('does not change the input bindings', () => {
    rebind(DEFAULT_BINDINGS, 'sprint', 0, 'KeyZ');
    expect(DEFAULT_BINDINGS.sprint[0]).toBe('ShiftLeft');
  });
});

describe('settings persistence', () => {
  it('round-trips through storage', () => {
    const store = memory();
    const s = { ...DEFAULT_SETTINGS, invertY: true, mouseSensitivity: 20, bindings: rebind(DEFAULT_BINDINGS, 'crouch', 0, 'KeyX') };
    saveSettings(s, store);
    expect(loadSettings(store)).toEqual(s);
  });

  it('falls back field by field on missing, broken or out-of-range values', () => {
    const m = mergeSettings({ mouseSensitivity: 1e9, invertY: 'yes', bindings: { journal: ['Escape', ''], sprint: ['KeyZ', ''] } });
    expect(m.mouseSensitivity).toBe(100);
    expect(m.invertY).toBe(false);
    expect(m.bindings.journal).toEqual(DEFAULT_BINDINGS.journal);
    expect(m.bindings.sprint).toEqual(['KeyZ', '']);
    expect(Object.keys(m.bindings)).toEqual([...ACTIONS]);
    const store = memory(); store.setItem('listening-post.settings.v1', '{not json');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('look and sticks', () => {
  it('turns by sensitivity degrees per 100 px, and invert flips pitch only', () => {
    const [yaw, pitch] = mouseToLook(100, 100, 12, false);
    expect(yaw).toBeCloseTo((-12 * Math.PI) / 180, 6);
    expect(pitch).toBeCloseTo((-12 * Math.PI) / 180, 6);
    const [yaw2, pitch2] = mouseToLook(100, 100, 12, true);
    expect(yaw2).toBeCloseTo(yaw, 6);
    expect(pitch2).toBeCloseTo(-pitch, 6);
  });

  it('ignores stick drift inside the dead zone and reaches full tilt smoothly', () => {
    expect(applyDeadzone(0.1)).toBe(0);
    expect(applyDeadzone(-0.15)).toBe(0);
    expect(applyDeadzone(1)).toBe(1);
    expect(applyDeadzone(-1)).toBe(-1);
    expect(applyDeadzone(0.16)).toBeLessThan(0.02);
  });
});
