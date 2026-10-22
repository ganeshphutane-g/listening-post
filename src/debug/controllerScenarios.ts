// M1.2 acceptance scenarios: step height, slope limit, crouching under a 1.2 m beam. Each builds its own
// geometry in an empty area far from the corridor, walks a fresh controller through it at the fixed step,
// and removes everything afterwards.
import type RAPIER from '@dimforge/rapier3d-compat';
import { CharacterController, type ControlIntent } from '../player/controller';
import type { ScenarioResult } from './harness';

const DT = 1 / 60;
const FORWARD: ControlIntent = { x: 0, y: 1, sprint: false, crouch: false, lean: 0 };

export function controllerScenarios(R: typeof RAPIER, world: RAPIER.World): Record<string, () => ScenarioResult> {
  function arena(x0: number, build: (box: (hx: number, hy: number, hz: number, x: number, y: number, z: number, rotX?: number) => void) => void) {
    const made: RAPIER.Collider[] = [];
    const box = (hx: number, hy: number, hz: number, x: number, y: number, z: number, rotX = 0) => {
      const q = { x: Math.sin(rotX / 2), y: 0, z: 0, w: Math.cos(rotX / 2) };
      made.push(world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x0 + x, y, z).setRotation(q)));
    };
    box(6, 0.1, 12, 0, -0.1, -6); // floor: top at y = 0, from z = +6 to z = -18
    build(box);
    world.step(); // scene queries see new colliders after a step
    return () => made.forEach((c) => world.removeCollider(c, false));
  }
  function walk(x0: number, intent: ControlIntent, seconds: number, startZ = 0) {
    const c = new CharacterController(R, world, { x: x0, y: 0, z: startZ });
    for (let i = 0; i < seconds / DT; i++) { c.step(intent, 0, DT); world.step(); }
    return c;
  }
  const done = (c: CharacterController) => world.removeCollider(c.collider, false);
  const f = (n: number) => n.toFixed(2);

  return {
    'controller-corridor-walk': () => {
      // from the game's spawn point, four seconds of walking forward stays on the corridor floor and gets
      // past the first pillars; sprinting for six seconds empties the stamina bar
      const c = new CharacterController(R, world, { x: 0.35, y: 0, z: 1.2 });
      for (let i = 0; i < 4 / DT; i++) { c.step(FORWARD, 0, DT); world.step(); }
      const walked = c.feet;
      for (let i = 0; i < 6.5 / DT; i++) { c.step({ ...FORWARD, x: 0.2, sprint: true }, 0, DT); world.step(); }
      const stamina = c.stamina, gait = c.gait;
      done(c);
      const pass = walked.z < -4.5 && Math.abs(walked.y) < 0.1 && stamina < 0.05 && gait === 'walk';
      return { name: 'controller-corridor-walk', pass, detail: `after 4 s walk: x=${f(walked.x)} y=${f(walked.y)} z=${f(walked.z)}; after sprinting: stamina=${f(stamina)} gait=${gait}` };
    },
    'controller-step-height': () => {
      // a 0.30 m step is climbed, a 0.45 m one is not (stepHeight 0.35 in content/player.json)
      const lowX = 200, highX = 220;
      const clearLow = arena(lowX, (box) => box(2, 0.15, 3, 0, 0.15, -5));
      const clearHigh = arena(highX, (box) => box(2, 0.225, 3, 0, 0.225, -5));
      const low = walk(lowX, FORWARD, 3), high = walk(highX, FORWARD, 3);
      const lf = low.feet, hf = high.feet;
      const pass = lf.y > 0.25 && lf.z < -2.5 && hf.y < 0.05 && hf.z > -2.1;
      [low, high].forEach(done); clearLow(); clearHigh();
      return { name: 'controller-step-height', pass, detail: `0.30 m step: feet y=${f(lf.y)} z=${f(lf.z)} grounded=${low.grounded}; 0.45 m step: feet y=${f(hf.y)} z=${f(hf.z)}` };
    },
    'controller-slope-limit': () => {
      // a 30° ramp is climbed, a 55° one is not (maxSlopeDeg 45)
      const gentleX = 240, steepX = 260;
      const ramp = (deg: number) => (box: (hx: number, hy: number, hz: number, x: number, y: number, z: number, rotX?: number) => void) => {
        const a = (deg * Math.PI) / 180, len = 4;
        // a slab rising toward -z, its low edge at z = -1 on the floor
        box(2, 0.05, len / 2, 0, Math.sin(a) * len / 2, -1 - Math.cos(a) * len / 2, a);
      };
      const clearG = arena(gentleX, ramp(30)), clearS = arena(steepX, ramp(55));
      const gentle = walk(gentleX, FORWARD, 4), steep = walk(steepX, FORWARD, 4);
      const g = gentle.feet, s = steep.feet;
      const pass = g.y > 0.8 && s.y < 0.35;
      [gentle, steep].forEach(done); clearG(); clearS();
      return { name: 'controller-slope-limit', pass, detail: `30° ramp: feet y=${f(g.y)}; 55° ramp: feet y=${f(s.y)}` };
    },
    'controller-crouch-beam': () => {
      // a beam with its underside at 1.2 m blocks a standing player, lets a crouching one through,
      // and does not let the player stand up beneath it
      const standX = 280, crouchX = 300;
      const beam = (box: (hx: number, hy: number, hz: number, x: number, y: number, z: number) => void) => box(3, 0.15, 0.6, 0, 1.35, -3);
      const clearA = arena(standX, beam), clearB = arena(crouchX, beam);
      const standing = walk(standX, FORWARD, 3);
      const crouching = walk(crouchX, { ...FORWARD, crouch: true }, 3.6);
      const sf = standing.feet, under = crouching.feet;
      // now under the beam: release crouch and keep still for a second
      for (let i = 0; i < 60; i++) { crouching.step({ x: 0, y: 0, sprint: false, crouch: false, lean: 0 }, 0, DT); world.step(); }
      const stillCrouched = crouching.crouched;
      const pass = sf.z > -2.45 && under.z < -2.5 && under.z > -3.6 && stillCrouched;
      [standing, crouching].forEach(done); clearA(); clearB();
      return { name: 'controller-crouch-beam', pass, detail: `standing stopped at z=${f(sf.z)}; crouching reached z=${f(under.z)}; stays crouched under the beam=${stillCrouched}` };
    },
  };
}
