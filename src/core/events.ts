// Typed event bus (MASTER_PLAN §4.3): systems talk through events and shared data, not direct calls.
export type Surface = 'concrete' | 'concrete_wet' | 'metal' | 'wood' | 'tile' | 'linoleum' | 'water' | 'gravel';

/** Every audible action (§3.5 item 1). Loudness is dB at 1 m; propagation (M3.1) attenuates it. */
export interface SoundEvent {
  kind: 'footstep' | 'impact';
  position: { x: number; y: number; z: number };
  loudnessDb: number;
  surface: Surface;
  sound: string; // asset id, e.g. step_concrete_walk_2
  source: 'player' | 'prop' | 'npc';
  time: number;
}

export interface GameEvents { sound: SoundEvent }

export class EventBus<E> {
  private handlers: { [K in keyof E]?: ((e: E[K]) => void)[] } = {};
  on<K extends keyof E>(type: K, fn: (e: E[K]) => void): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => { this.handlers[type] = this.handlers[type]!.filter((f) => f !== fn); };
  }
  emit<K extends keyof E>(type: K, e: E[K]): void {
    for (const fn of this.handlers[type] ?? []) fn(e);
  }
}
