// Footsteps and impacts as sound events (MASTER_PLAN §3.5 item 1, M1.5): the surface under the player or
// between two colliding bodies, a loudness from content/sound.json, and a sound variant that never repeats
// twice in a row. No audio plays yet (M5.3); the creature's hearing (M3) and the debug log consume these.
import type RAPIER from '@dimforge/rapier3d-compat';
import tuning from '../../content/sound.json';
import type { EventBus, GameEvents, Surface } from '../core/events';
import type { Gait } from '../player/controller';

export function footstepDb(surface: Surface, gait: Gait, t = tuning): number {
  return t.footstepDb[gait] + t.surfaceDb[surface];
}

/** Impact loudness from the contact impulse (N·s): +6 dB per doubling, plus the louder surface of the pair. */
export function impactDb(impulse: number, a: Surface, b: Surface, t = tuning): number {
  const base = t.impact.referenceDb + 20 * Math.log10(Math.max(impulse, 1e-6) / t.impact.referenceImpulse);
  const pair = Math.max(t.surfaceDb[a], t.surfaceDb[b]);
  return Math.min(t.impact.maxDb, Math.max(t.impact.minDb, base + pair));
}

/** Picks variant numbers 1..n with no immediate repeat; deterministic for a given seed (§4.3). */
export class VariantPicker {
  private last = new Map<string, number>();
  constructor(private seed = 1, private readonly n = tuning.variants) {}
  private rand(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 2 ** 32; }
  pick(key: string): number {
    const prev = this.last.get(key);
    let v: number;
    if (prev === undefined || this.n < 2) {
      v = 1 + Math.floor(this.rand() * this.n);
    } else {
      v = 1 + Math.floor(this.rand() * (this.n - 1)); // one of the other n-1 variants
      if (v >= prev) v++;
    }
    this.last.set(key, v);
    return v;
  }
}

export class SoundEvents {
  private surfaces = new Map<number, Surface>();
  private picker = new VariantPicker();
  private lastImpact = new Map<number, number>();
  readonly queue: RAPIER.EventQueue;
  time = 0;

  constructor(private readonly R: typeof RAPIER, private readonly world: RAPIER.World, private readonly bus: EventBus<GameEvents>) {
    this.queue = new R.EventQueue(true);
  }

  /** Tag a collider with its surface; with `impacts`, its hard contacts become impact events. */
  tag(collider: RAPIER.Collider, surface: Surface, impacts = false): void {
    this.surfaces.set(collider.handle, surface);
    if (impacts) {
      collider.setActiveEvents(this.R.ActiveEvents.CONTACT_FORCE_EVENTS);
      // a resting body presses its weight into the floor every step; only forces well above that are impacts
      const weight = collider.mass() * 9.81;
      collider.setContactForceEventThreshold(Math.max(tuning.impact.forceThreshold, weight * tuning.impact.weightMultiple));
    }
  }

  surfaceOf(collider: RAPIER.Collider | null | undefined): Surface {
    return (collider && this.surfaces.get(collider.handle)) || 'concrete';
  }

  /** The surface under a point (a short ray down), for footsteps. */
  surfaceBelow(p: { x: number; y: number; z: number }, exclude?: RAPIER.Collider): Surface {
    const hit = this.world.castRay(new this.R.Ray({ x: p.x, y: p.y + 0.1, z: p.z }, { x: 0, y: -1, z: 0 }), 0.4, true, undefined, undefined, exclude);
    return this.surfaceOf(hit?.collider);
  }

  footstep(position: { x: number; y: number; z: number }, gait: Gait, exclude?: RAPIER.Collider): void {
    const surface = this.surfaceBelow(position, exclude);
    const key = `step_${surface}_${gait}`;
    this.bus.emit('sound', { kind: 'footstep', position, loudnessDb: footstepDb(surface, gait), surface, sound: `${key}_${this.picker.pick(key)}`, source: 'player', time: this.time });
  }

  /** Call after each world.step(queue): turns contact forces above the threshold into impact events. */
  drain(dt: number): void {
    this.time += dt;
    this.queue.drainContactForceEvents((e) => {
      const c1 = this.world.getCollider(e.collider1()), c2 = this.world.getCollider(e.collider2());
      const key0 = Math.min(c1.handle, c2.handle);
      if (this.time - (this.lastImpact.get(key0) ?? -1) < tuning.impact.cooldown) return; // one event per bounce
      this.lastImpact.set(key0, this.time);
      const s1 = this.surfaceOf(c1), s2 = this.surfaceOf(c2);
      const impulse = e.totalForceMagnitude() * dt;
      const p = (c1.parent() ? c1 : c2).translation();
      const louder = tuning.surfaceDb[s1] >= tuning.surfaceDb[s2] ? s1 : s2;
      const key = `impact_${louder}`;
      this.bus.emit('sound', { kind: 'impact', position: { x: p.x, y: p.y, z: p.z }, loudnessDb: impactDb(impulse, s1, s2), surface: louder, sound: `${key}_${this.picker.pick(key)}`, source: 'prop', time: this.time });
    });
  }
}
