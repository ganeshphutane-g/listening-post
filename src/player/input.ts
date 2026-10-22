// Input (MASTER_PLAN §3.8, M1.1): keyboard and mouse through rebindable actions, pointer lock with raw mouse
// movement where the browser allows it, and a standard-mapping gamepad. Releasing the pointer (Esc, switching
// tabs) pauses the game: the browser only re-locks after a click, so the pause overlay asks for one.
import { ACTIONS, type Action, type Settings, actionsByCode } from '../core/settings';

// standard gamepad mapping indices (https://w3c.github.io/gamepad/#remapping), per §3.8
const PAD: Partial<Record<Action, number>> = {
  sprint: 10, crouch: 1, leanLeft: 4, leanRight: 5, interact: 7, throw: 6, flashlight: 12, scanner: 15, journal: 8,
};
const PAD_PAUSE = 9;
export const STICK_DEADZONE = 0.15;

/** Rescales a stick axis so the dead zone maps to 0 and full tilt to ±1, without a jump at the edge. */
export function applyDeadzone(v: number, dz = STICK_DEADZONE): number {
  const a = Math.abs(v);
  return a <= dz ? 0 : Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

/** Mouse pixels → look change in radians (yaw, pitch); pitch is positive when looking up. */
export function mouseToLook(dx: number, dy: number, sensitivity: number, invertY: boolean): [number, number] {
  const k = ((sensitivity / 100) * Math.PI) / 180;
  return [-dx * k, (invertY ? dy : -dy) * k];
}

export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<Action>();
  private byCode: Map<string, Action[]>;
  private lookDx = 0;
  private lookDy = 0;
  private padPausePrev = false;
  private padActive = new Set<Action>();
  locked = false;
  /** ?nolock=1: play without capturing the mouse (browsers that refuse pointer lock, automated playtests) */
  readonly noLock = new URLSearchParams(location.search).has('nolock');
  paused = true; // until the first click grants pointer lock (and audio, M1.6)
  onPauseChange: (paused: boolean) => void = () => {};

  constructor(private readonly target: HTMLElement, public settings: Settings) {
    this.byCode = actionsByCode(settings.bindings);
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.locked) e.preventDefault(); // Tab is the journal, not focus traversal
      if (e.code === 'Escape' && this.noLock && this.locked) { this.setLocked(false); return; } // without a real lock the browser does not release anything
      if (!e.repeat) this.press(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('mousedown', (e) => { if (this.locked) this.press(`Mouse${e.button}`); }); // locking is the menus' job (M1.6)
    addEventListener('mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => { if (this.locked) { this.lookDx += e.movementX; this.lookDy += e.movementY; } });
    document.addEventListener('pointerlockchange', () => this.setLocked(document.pointerLockElement === target));
    addEventListener('blur', () => this.down.clear()); // keys released while away would otherwise stay held
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setPaused(true); }); // §4.10
  }

  /** Raw (unaccelerated) mouse where supported; Safari and older Firefox reject the option, so retry without it. */
  async lock(): Promise<boolean> {
    if (this.noLock) { this.setLocked(true); return true; }
    const el = this.target as HTMLElement & { requestPointerLock(o?: { unadjustedMovement?: boolean }): Promise<void> | void };
    try {
      await el.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try { await el.requestPointerLock(); } catch { return false; } // denied: the menu says so and asks again
    }
    // some browsers resolve without locking (or never return a promise); check what actually happened
    await new Promise((r) => setTimeout(r, 300));
    return document.pointerLockElement === this.target;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.byCode = actionsByCode(settings.bindings);
  }

  /** Pointer lock gained or lost; losing it pauses. Public so scenarios can drive it without a real lock. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked) this.down.clear();
    this.setPaused(!locked);
  }

  private setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.onPauseChange(paused);
  }

  private press(code: string): void {
    this.down.add(code);
    for (const a of this.byCode.get(code) ?? []) this.pressedThisFrame.add(a);
  }

  isDown(action: Action): boolean {
    if (this.paused) return false;
    return this.settings.bindings[action].some((c) => c && this.down.has(c)) || this.padActive.has(action);
  }

  /** True on the frame the action was first pressed. */
  wasPressed(action: Action): boolean {
    return !this.paused && this.pressedThisFrame.has(action);
  }

  /** Movement intent in [-1, 1]: x = strafe right, y = forward. Keyboard and left stick combined. */
  move(pad?: Gamepad | null): { x: number; y: number } {
    if (this.paused) return { x: 0, y: 0 };
    let x = (this.isDown('moveRight') ? 1 : 0) - (this.isDown('moveLeft') ? 1 : 0);
    let y = (this.isDown('moveForward') ? 1 : 0) - (this.isDown('moveBack') ? 1 : 0);
    if (pad) { x += applyDeadzone(pad.axes[0] ?? 0); y -= applyDeadzone(pad.axes[1] ?? 0); }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  /** Look change since the last call, in radians: mouse plus right stick (scaled by frame time). */
  look(dt: number, pad?: Gamepad | null): { yaw: number; pitch: number } {
    const s = this.settings;
    let [yaw, pitch] = mouseToLook(this.lookDx, this.lookDy, s.mouseSensitivity, s.invertY);
    this.lookDx = this.lookDy = 0;
    if (pad && !this.paused) {
      const k = ((s.gamepadLookSpeed * Math.PI) / 180) * dt;
      yaw -= applyDeadzone(pad.axes[2] ?? 0) * k;
      pitch += (s.invertY ? 1 : -1) * applyDeadzone(pad.axes[3] ?? 0) * k;
    }
    return this.paused ? { yaw: 0, pitch: 0 } : { yaw, pitch };
  }

  /** Poll the first connected gamepad; call once per frame before reading actions. */
  pollGamepad(): Gamepad | null {
    const pad = navigator.getGamepads?.().find((p) => p && p.connected && p.mapping === 'standard') ?? null;
    const before = new Set(this.padActive);
    this.padActive.clear();
    if (!pad) return null;
    for (const a of ACTIONS) {
      const i = PAD[a];
      if (i !== undefined && pad.buttons[i]?.pressed) {
        this.padActive.add(a);
        if (!before.has(a)) this.pressedThisFrame.add(a);
      }
    }
    const pause = !!pad.buttons[PAD_PAUSE]?.pressed;
    if (pause && !this.padPausePrev) this.setPaused(!this.paused); // the Menu button toggles pause; mouse look still needs a click
    this.padPausePrev = pause;
    return pad;
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
  }
}
