// Player settings, saved in local storage (MASTER_PLAN §4.9). Missing or broken saved values fall back to
// defaults field by field, so a settings file from an older build never breaks a newer one.
export const ACTIONS = [
  'moveForward', 'moveBack', 'moveLeft', 'moveRight', 'sprint', 'crouch', 'leanLeft', 'leanRight',
  'interact', 'throw', 'flashlight', 'scanner', 'journal',
] as const;
export type Action = (typeof ACTIONS)[number];

/** Two slots per action. Codes are KeyboardEvent.code (keyboard-layout independent) or Mouse0..Mouse4. */
export type Bindings = Record<Action, [string, string]>;

export interface Settings {
  version: 1;
  mouseSensitivity: number; // degrees of turn per 100 px of mouse movement
  invertY: boolean;
  gamepadLookSpeed: number; // degrees per second at full stick
  crouchToggle: boolean;
  headBob: boolean; // motion effects can be turned off (§1 accessibility)
  fov: number; // vertical field of view at 16:9, degrees (§1 accessibility); wider screens see more (D-010)
  quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra'; // auto picks Medium until M4.7 detects hardware
  bindings: Bindings;
}

// MASTER_PLAN §3.8. Mouse codes use MouseEvent.button: 0 left, 1 middle, 2 right.
export const DEFAULT_BINDINGS: Bindings = {
  moveForward: ['KeyW', 'ArrowUp'], moveBack: ['KeyS', 'ArrowDown'], moveLeft: ['KeyA', 'ArrowLeft'], moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', ''], crouch: ['KeyC', 'ControlLeft'], leanLeft: ['KeyQ', ''], leanRight: ['KeyE', ''],
  interact: ['Mouse0', ''], throw: ['Mouse2', ''], flashlight: ['KeyF', ''], scanner: ['KeyR', ''], journal: ['Tab', ''],
};

export const DEFAULT_SETTINGS: Settings = {
  version: 1, mouseSensitivity: 12, invertY: false, gamepadLookSpeed: 140, crouchToggle: false, headBob: true, fov: 72, quality: 'auto', bindings: DEFAULT_BINDINGS,
};

/** Codes that can never be bound: Escape releases the pointer and pauses (browser rule, §3.8). */
export const RESERVED_CODES = new Set(['Escape']);

const KEY = 'listening-post.settings.v1';

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

function safeStorage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; } // private windows and blocked storage throw
}

export function mergeSettings(saved: unknown): Settings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Settings>;
  const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const bindings = { ...DEFAULT_BINDINGS };
  for (const a of ACTIONS) {
    const b = (s.bindings as Partial<Bindings> | undefined)?.[a];
    if (Array.isArray(b) && b.length === 2 && b.every((c) => typeof c === 'string' && !RESERVED_CODES.has(c))) bindings[a] = [b[0], b[1]];
  }
  return {
    version: 1,
    mouseSensitivity: num(s.mouseSensitivity, DEFAULT_SETTINGS.mouseSensitivity, 1, 100),
    invertY: typeof s.invertY === 'boolean' ? s.invertY : DEFAULT_SETTINGS.invertY,
    gamepadLookSpeed: num(s.gamepadLookSpeed, DEFAULT_SETTINGS.gamepadLookSpeed, 20, 400),
    crouchToggle: typeof s.crouchToggle === 'boolean' ? s.crouchToggle : DEFAULT_SETTINGS.crouchToggle,
    headBob: typeof s.headBob === 'boolean' ? s.headBob : DEFAULT_SETTINGS.headBob,
    fov: num(s.fov, DEFAULT_SETTINGS.fov, 55, 100),
    quality: (['auto', 'low', 'medium', 'high', 'ultra'] as const).includes(s.quality as Settings['quality']) ? s.quality as Settings['quality'] : DEFAULT_SETTINGS.quality,
    bindings,
  };
}

export function loadSettings(storage: StorageLike | null = safeStorage()): Settings {
  try { return mergeSettings(JSON.parse(storage?.getItem(KEY) ?? 'null')); } catch { return mergeSettings(null); }
}

export function saveSettings(settings: Settings, storage: StorageLike | null = safeStorage()): void {
  try { storage?.setItem(KEY, JSON.stringify(settings)); } catch { /* storage full or blocked: settings last for this session */ }
}

/**
 * Bind `code` to one slot of `action`. If another action already uses the code, the two swap, so no key is
 * ever bound twice and no action silently loses its only binding. An empty code clears the slot.
 */
export function rebind(bindings: Bindings, action: Action, slot: 0 | 1, code: string): Bindings {
  if (RESERVED_CODES.has(code)) throw new Error(`${code} is reserved`);
  const next = Object.fromEntries(ACTIONS.map((a) => [a, [...bindings[a]] as [string, string]])) as Bindings;
  const previous = next[action][slot];
  if (code) {
    for (const a of ACTIONS) for (const i of [0, 1] as const) {
      if (next[a][i] === code && !(a === action && i === slot)) next[a][i] = previous;
    }
  }
  next[action][slot] = code;
  return next;
}

/** code → actions, for event handling. */
export function actionsByCode(bindings: Bindings): Map<string, Action[]> {
  const m = new Map<string, Action[]>();
  for (const a of ACTIONS) for (const c of bindings[a]) if (c) m.set(c, [...(m.get(c) ?? []), a]);
  return m;
}
