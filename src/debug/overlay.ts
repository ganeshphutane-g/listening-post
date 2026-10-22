// Debug overlay, ?debug=1 (MASTER_PLAN §9 M1.5): a live log of sound events (time, kind, surface,
// loudness, sound id), the data the creature will hear in M3. More panels join it later (AI scores, budgets).
import type { EventBus, GameEvents } from '../core/events';

export function installDebugOverlay(bus: EventBus<GameEvents>): void {
  const panel = document.createElement('div');
  panel.id = 'debug-overlay';
  panel.innerHTML = '<b>Sound events</b><ol></ol>';
  document.body.appendChild(panel);
  const list = panel.querySelector('ol')!;
  bus.on('sound', (e) => {
    const li = document.createElement('li');
    li.textContent = `${e.time.toFixed(1)}s ${e.kind} ${e.surface} ${e.loudnessDb.toFixed(0)} dB ${e.sound}`;
    list.prepend(li);
    while (list.children.length > 10) list.lastElementChild!.remove();
  });
}
