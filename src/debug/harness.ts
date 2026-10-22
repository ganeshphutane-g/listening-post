// Page side of the Electron harness (tools/harness/run.mjs). Active with ?harness=1. The runner drives
// frames through window.__harness instead of requestAnimationFrame, so hidden windows and slow
// software adapters still produce identical frames. Readback goes through a render target because the
// compositor's capture of a WebGPU canvas came back blank (MASTER_PLAN §2.1).
import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import { advanceClock, realNow } from './clock';
import { packReadback } from '../render/readback';
import type { DisplayState } from '../render/display';
import type { Input } from '../player/input';
import { controllerScenarios } from './controllerScenarios';
import { interactionScenarios } from './interactionScenarios';
import type { SoundEvents } from '../audio/soundEvents';
import type { EventBus, GameEvents, SoundEvent } from '../core/events';
import { CharacterController } from '../player/controller';

export interface Stop { name: string; pos: [number, number, number]; target: [number, number, number] }
export interface ScenarioResult { name: string; pass: boolean; detail: string }

export interface HarnessContext {
  renderer: THREE.WebGPURenderer;
  pipeline: THREE.RenderPipeline;
  camera: THREE.PerspectiveCamera;
  backend: string;
  isWebGPU: boolean;
  /** advance the simulation by one fixed step (lights, animation, physics when `physics` is true) */
  tick(physics: boolean): void;
  world: RAPIER.World;
  rapier: typeof RAPIER;
  crates: { body: RAPIER.RigidBody; mesh: THREE.Object3D }[];
  display: () => DisplayState;
  input: Input;
  /** the camera jumped (tour stop): anything that trails it must catch up at once */
  onCameraCut: () => void;
  sound: SoundEvents;
  bus: EventBus<GameEvents>;
}

const STEP_MS = 1000 / 60;

export function installHarness(ctx: HarnessContext): void {
  const { renderer, pipeline, camera } = ctx;

  // settle physics before any still, so the first frame is the same on every run
  for (let i = 0; i < 300; i++) ctx.tick(true);

  async function readPixels(): Promise<{ png: string; width: number; height: number }> {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = size.x, h = size.y;
    const rt = new THREE.RenderTarget(w, h, { type: THREE.UnsignedByteType });
    renderer.setRenderTarget(rt);
    pipeline.render();
    renderer.setRenderTarget(null);
    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
    rt.dispose();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    img.data.set(packReadback(px as Uint8Array, w, h, !ctx.isWebGPU));
    g.putImageData(img, 0, 0);
    return { png: c.toDataURL('image/png'), width: w, height: h };
  }

  function frame(physics: boolean): void {
    advanceClock(STEP_MS);
    ctx.tick(physics);
    pipeline.render();
  }

  const scenarios: Record<string, () => ScenarioResult> = {
    ...controllerScenarios(ctx.rapier, ctx.world),
    ...interactionScenarios(ctx.rapier, ctx.world),
    'sound-events': () => {
      // M1.5: walking emits footsteps on the tagged floor, a dropped crate emits an impact louder than a step
      const got: SoundEvent[] = [];
      const off = ctx.bus.on('sound', (e) => got.push(e));
      const step = () => { ctx.world.step(ctx.sound.queue); ctx.sound.drain(1 / 60); };
      const walker = new CharacterController(ctx.rapier, ctx.world, { x: 0.35, y: 0, z: 1.0 });
      walker.onFootstep = (e) => ctx.sound.footstep(e.position, e.gait, walker.collider);
      for (let i = 0; i < 120; i++) { walker.step({ x: 0, y: 1, sprint: false, crouch: false, lean: 0 }, 0, 1 / 60); step(); }
      ctx.world.removeCollider(walker.collider, false);
      const crate = ctx.crates[5].body; // the one on its own at z = -12
      crate.setTranslation({ x: -0.9, y: 2.5, z: -12 }, true);
      crate.setLinvel({ x: 0, y: 0, z: 0 }, true);
      for (let i = 0; i < 90; i++) step();
      off();
      const steps = got.filter((e) => e.kind === 'footstep'), hits = got.filter((e) => e.kind === 'impact');
      const loudest = Math.max(0, ...hits.map((e) => e.loudnessDb));
      const pass = steps.length >= 2 && steps.every((e) => e.surface === 'concrete_wet') && hits.length > 0 && hits.length <= 6 && loudest > steps[0].loudnessDb;
      return { name: 'sound-events', pass, detail: `${steps.length} footsteps (${steps[0]?.surface}, ${steps[0]?.loudnessDb} dB, e.g. ${steps[0]?.sound}); ${hits.length} impacts, loudest ${loudest.toFixed(0)} dB (${hits[0]?.sound})` };
    },
    'pause-on-pointer-release': () => {
      // M1.1: releasing pointer lock (Esc, alt-tab) pauses and shows the overlay; locking resumes.
      // Real pointer lock needs a user gesture, so the scenario drives the same handler the browser event calls.
      const overlay = document.getElementById('pause')!;
      const before = ctx.input.paused;
      ctx.input.setLocked(true);
      const playing = !ctx.input.paused && overlay.hidden;
      ctx.input.setLocked(false);
      const paused = ctx.input.paused && !overlay.hidden;
      return { name: 'pause-on-pointer-release', pass: before && playing && paused, detail: `start paused=${before}, locked→playing=${playing}, released→paused with overlay=${paused}` };
    },
    'crates-rest': () => {
      const ys = ctx.crates.map(({ body }) => body.translation().y);
      const speeds = ctx.crates.map(({ body }) => { const v = body.linvel(); return Math.hypot(v.x, v.y, v.z); });
      const pass = speeds.every((s) => s < 0.05) && ys.every((y) => y > 0.3);
      return { name: 'crates-rest', pass, detail: `y=${ys.map((y) => y.toFixed(2)).join(',')} maxSpeed=${Math.max(...speeds).toFixed(3)}` };
    },
    'crate-drop': () => {
      // a crate dropped from 3 m onto open floor comes to rest on it (half-extent 0.45 m)
      const R = ctx.rapier;
      const body = ctx.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0.3, 3, -14));
      ctx.world.createCollider(R.ColliderDesc.cuboid(0.45, 0.45, 0.45).setDensity(35), body);
      for (let i = 0; i < 240; i++) ctx.world.step();
      const y = body.translation().y, v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      ctx.world.removeRigidBody(body);
      return { name: 'crate-drop', pass: Math.abs(y - 0.45) < 0.05 && speed < 0.05, detail: `y=${y.toFixed(3)} speed=${speed.toFixed(3)}` };
    },
  };

  window.__harness = {
    backend: ctx.backend,
    display: () => ctx.display(),
    scenarios: () => Object.keys(scenarios),
    scenario: (name: string) => {
      const run = scenarios[name];
      if (!run) throw new Error(`unknown scenario ${name}`);
      return run();
    },
    async still(stop?: Stop, warmup = 3) {
      if (stop) {
        camera.position.set(...stop.pos);
        camera.lookAt(...stop.target);
        ctx.onCameraCut();
      }
      for (let i = 0; i < warmup; i++) frame(false);
      return readPixels();
    },
    async bench(frames = 240) {
      const ms: number[] = [];
      for (let i = 0; i < frames; i++) {
        const t0 = realNow();
        frame(true);
        ms.push(realNow() - t0);
      }
      await readPixels(); // waits for the GPU to finish the queued frames
      const sorted = ms.slice(8).sort((a, b) => a - b);
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      return {
        backend: ctx.backend, frames,
        cpuMsAvg: +avg.toFixed(2), cpuMsP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
        note: 'CPU encode time only; draw calls and triangles come from the benchmark page (benchpage), where three.js resets its counters per animation frame',
      };
    },
  };
  document.title = 'HARNESS_READY';
  if (new URLSearchParams(location.search).has('plant')) {
    // the runner's self-test: an uncaught error after start-up must fail the run
    setTimeout(() => { throw new Error('PLANTED_ERROR'); }, 0);
  }
}

declare global {
  interface Window {
    __harness?: {
      backend: string;
      display(): DisplayState;
      scenarios(): string[];
      scenario(name: string): ScenarioResult;
      still(stop?: Stop, warmup?: number): Promise<{ png: string; width: number; height: number }>;
      bench(frames?: number): Promise<Record<string, number | string>>;
    };
  }
}
