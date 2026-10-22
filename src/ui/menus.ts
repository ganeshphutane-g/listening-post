// Menus (MASTER_PLAN §3.9, §4.10, M1.6): loading progress, a title screen whose Play button grants pointer lock
// and starts audio (both need a user gesture), a pause menu whenever the pointer is released, and settings:
// mouse, field of view, head-bob, crouch mode, quality tier and key remapping, saved on every change.
import { ACTIONS, type Action, DEFAULT_SETTINGS, RESERVED_CODES, type Settings, rebind } from '../core/settings';
import type { Input } from '../player/input';

export type Screen = 'loading' | 'title' | 'playing' | 'paused' | 'settings';

const LABELS: Record<Action, string> = {
  moveForward: 'Move forward', moveBack: 'Move back', moveLeft: 'Move left', moveRight: 'Move right', sprint: 'Sprint',
  crouch: 'Crouch', leanLeft: 'Lean left', leanRight: 'Lean right', interact: 'Interact / grab', throw: 'Throw',
  flashlight: 'Flashlight', scanner: 'Radio scanner', journal: 'Journal',
};
const keyName = (code: string) => code === '' ? '—' : code.startsWith('Mouse') ? ['Left mouse', 'Middle mouse', 'Right mouse', 'Mouse 4', 'Mouse 5'][Number(code.slice(5))] ?? code
  : code.startsWith('Arrow') ? `${code.slice(5)} arrow`
  : code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, (_m, k: string, side: string) => `${k} (${side.toLowerCase()})`);

export interface MenuOptions {
  input: Input;
  settings: Settings;
  onSettings(s: Settings): void;
  audio: AudioContext;
}

export class Menus {
  screen: Screen = 'loading';
  private from: Screen = 'title'; // where Settings returns to
  private settings: Settings;
  private readonly root = document.createElement('div');
  private rebinding: { action: Action; slot: 0 | 1; button: HTMLButtonElement } | null = null;

  constructor(private readonly o: MenuOptions) {
    this.settings = o.settings;
    this.root.id = 'menus';
    this.root.innerHTML = `
      <section id="title" class="menu" hidden><h1>Listening Post</h1><p class="sub">Station K-7 · 1978</p>
        <button id="btn-play">Play</button><button id="btn-title-settings">Settings</button>
        <p id="lock-refused" class="warn" hidden>Your browser did not let the game capture the mouse. Click Play again; if it keeps happening, check that this page is allowed to use the pointer.</p>
        <p class="keys">WASD move · Shift sprint · C crouch · Q/E lean · Left mouse grab · Right mouse throw · F flashlight · Esc pause · Alt+Enter fullscreen</p></section>
      <section id="pause" class="menu" hidden><h1>Paused</h1>
        <button id="btn-resume">Resume</button><button id="btn-pause-settings">Settings</button><button id="btn-quit">Quit to title</button></section>
      <section id="settings" class="menu wide" hidden><h1>Settings</h1>
        <div class="grid">
          <label>Mouse sensitivity <span id="v-sens"></span><input id="set-sens" type="range" min="1" max="60" step="1"></label>
          <label>Field of view <span id="v-fov"></span><input id="set-fov" type="range" min="55" max="100" step="1"></label>
          <label class="check"><input id="set-invert" type="checkbox"> Invert vertical look</label>
          <label class="check"><input id="set-bob" type="checkbox"> Head-bob (motion effects)</label>
          <label>Crouch <select id="set-crouch"><option value="hold">Hold</option><option value="toggle">Toggle</option></select></label>
          <label>Quality <select id="set-quality"><option value="auto">Automatic</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
        </div>
        <h2>Keys</h2><table id="bindings"></table>
        <button id="btn-defaults">Reset to defaults</button><button id="btn-back">Back</button></section>`;
    document.body.appendChild(this.root);
    const $ = <T extends HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    $('btn-play').onclick = () => this.play();
    $('btn-resume').onclick = () => this.play();
    $('btn-title-settings').onclick = () => this.openSettings('title');
    $('btn-pause-settings').onclick = () => this.openSettings('paused');
    $('btn-quit').onclick = () => this.show('title');
    $('btn-back').onclick = () => this.show(this.from);
    $('btn-defaults').onclick = () => this.update({ ...DEFAULT_SETTINGS });
    $<HTMLInputElement>('set-sens').oninput = (e) => this.update({ ...this.settings, mouseSensitivity: Number((e.target as HTMLInputElement).value) });
    $<HTMLInputElement>('set-fov').oninput = (e) => this.update({ ...this.settings, fov: Number((e.target as HTMLInputElement).value) });
    $<HTMLInputElement>('set-invert').onchange = (e) => this.update({ ...this.settings, invertY: (e.target as HTMLInputElement).checked });
    $<HTMLInputElement>('set-bob').onchange = (e) => this.update({ ...this.settings, headBob: (e.target as HTMLInputElement).checked });
    $<HTMLSelectElement>('set-crouch').onchange = (e) => this.update({ ...this.settings, crouchToggle: (e.target as HTMLSelectElement).value === 'toggle' });
    $<HTMLSelectElement>('set-quality').onchange = (e) => this.update({ ...this.settings, quality: (e.target as HTMLSelectElement).value as Settings['quality'] });
    // the next key or mouse button after "press a key" becomes the binding; Escape cancels
    const capture = (code: string, e: Event) => {
      if (!this.rebinding) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const { action, slot } = this.rebinding;
      this.rebinding = null;
      if (!RESERVED_CODES.has(code)) this.update({ ...this.settings, bindings: rebind(this.settings.bindings, action, slot, code) });
      else this.renderBindings();
    };
    addEventListener('keydown', (e) => capture(e.code, e), true);
    addEventListener('mousedown', (e) => { if (this.rebinding && e.target !== this.rebinding.button) capture(`Mouse${e.button}`, e); }, true);
    o.input.onPauseChange = (paused) => {
      if (!paused) this.show('playing');
      else if (this.screen === 'playing') this.show('paused');
    };
    this.renderSettings();
  }

  /** Loading finished: show the title screen. */
  ready(): void { document.getElementById('loading')?.remove(); this.show('title'); }

  show(screen: Screen): void {
    this.screen = screen;
    for (const id of ['title', 'pause', 'settings']) (this.root.querySelector(`#${id}`) as HTMLElement).hidden = true;
    const el = { title: 'title', paused: 'pause', settings: 'settings' }[screen as 'title' | 'paused' | 'settings'];
    if (el) (this.root.querySelector(`#${el}`) as HTMLElement).hidden = false;
    this.root.classList.toggle('open', !!el);
  }

  private play(): void {
    void this.o.audio.resume(); // browsers start audio only from a user gesture (§4.10)
    void this.o.input.lock().then((ok) => {
      for (const id of ['lock-refused']) (this.root.querySelector(`#${id}`) as HTMLElement).hidden = ok;
    });
  }

  private openSettings(from: Screen): void { this.from = from; this.renderSettings(); this.show('settings'); }

  private update(s: Settings): void {
    this.settings = s;
    this.o.onSettings(s);
    this.renderSettings();
  }

  private renderSettings(): void {
    const s = this.settings, q = <T extends HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    q<HTMLInputElement>('set-sens').value = String(s.mouseSensitivity);
    q('v-sens').textContent = String(s.mouseSensitivity);
    q<HTMLInputElement>('set-fov').value = String(s.fov);
    q('v-fov').textContent = `${s.fov}°`;
    q<HTMLInputElement>('set-invert').checked = s.invertY;
    q<HTMLInputElement>('set-bob').checked = s.headBob;
    q<HTMLSelectElement>('set-crouch').value = s.crouchToggle ? 'toggle' : 'hold';
    q<HTMLSelectElement>('set-quality').value = s.quality;
    this.renderBindings();
  }

  private renderBindings(): void {
    const table = this.root.querySelector('#bindings')!;
    table.replaceChildren(...ACTIONS.map((a) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = LABELS[a]; tr.appendChild(th);
      for (const slot of [0, 1] as const) {
        const td = document.createElement('td'), b = document.createElement('button');
        b.className = 'bind'; b.dataset.action = a; b.dataset.slot = String(slot);
        b.textContent = keyName(this.settings.bindings[a][slot]);
        b.onclick = () => { this.rebinding = { action: a, slot, button: b }; b.textContent = 'Press a key…'; };
        td.appendChild(b); tr.appendChild(td);
      }
      return tr;
    }));
  }
}
