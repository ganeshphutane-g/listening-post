// M1.4 acceptance scenarios: a door opens when dragged and stops at its limit; a full-strength throw of a
// 1 kg object lands within the tuned range; a drawer stops at both ends of its travel. Each builds its own
// test area far from the corridor and removes it afterwards.
import type RAPIER from '@dimforge/rapier3d-compat';
import { Interaction } from '../player/interaction';
import tuning from '../../content/interaction.json';
import type { ScenarioResult } from './harness';

const DT = 1 / 60;
type V3 = { x: number; y: number; z: number };
const norm = (v: V3) => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; };

export function interactionScenarios(R: typeof RAPIER, world: RAPIER.World): Record<string, () => ScenarioResult> {
  const floor = (x0: number) => world.createCollider(R.ColliderDesc.cuboid(8, 0.1, 12).setTranslation(x0, -0.1, -4));
  const removeBodies = (bodies: RAPIER.RigidBody[]) => bodies.forEach((b) => world.removeRigidBody(b));
  const doorYaw = (b: RAPIER.RigidBody) => { const q = b.rotation(); return (2 * Math.atan2(q.y, q.w) * 180) / Math.PI; };

  return {
    'interaction-door-drag': () => {
      const x0 = 340, f = floor(x0), ia = new Interaction(R, world);
      const hinge = { x: x0, y: 0, z: -3 };
      const door = ia.addDoor(hinge, 0.9, 2.0, 0);
      world.step();
      const eye = { x: x0 + 0.6, y: 1.6, z: -1.6 };
      const aim = (deg: number) => {
        const a = (deg * Math.PI) / 180;
        return norm({ x: hinge.x + Math.cos(a) * 0.75 - eye.x, y: 1.05 - eye.y, z: hinge.z - Math.sin(a) * 0.75 - eye.z });
      };
      const dir0 = aim(0);
      const grabbed = ia.begin(eye, dir0);
      // the player walks the door open: the hand (a fixed distance along the view) follows the door's arc
      const g = ia.held?.grabDistance ?? 1;
      const handAt = (deg: number) => { const a = (deg * Math.PI) / 180; return { x: hinge.x + Math.cos(a) * 0.75, y: 1.05, z: hinge.z - Math.sin(a) * 0.75 }; };
      const eyeFor = (deg: number) => { const h = handAt(deg); return { x: h.x - dir0.x * g, y: h.y - dir0.y * g, z: h.z - dir0.z * g }; };
      for (let i = 0; i <= 90; i++) { ia.hold(eyeFor(Math.min(80, i)), dir0, DT); world.step(); }
      for (let i = 0; i < 30; i++) { ia.hold(eyeFor(80), dir0, DT); world.step(); }
      const opened = doorYaw(door.body);
      for (let i = 0; i < 90; i++) { ia.hold(eyeFor(80 + i), dir0, DT); world.step(); } // keep pushing past the stop
      const pushed = doorYaw(door.body);
      ia.end();
      removeBodies([door.body]); world.removeCollider(f, false);
      const pass = grabbed && opened > 45 && pushed <= tuning.door.maxOpenDeg + 3;
      return { name: 'interaction-door-drag', pass, detail: `grabbed=${grabbed}; dragged to ${opened.toFixed(1)}°; pushed past the stop: ${pushed.toFixed(1)}° (limit ${tuning.door.maxOpenDeg}°)` };
    },
    'interaction-throw-distance': () => {
      const x0 = 360, f = floor(x0), ia = new Interaction(R, world);
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x0, 1.5, 0).setCcdEnabled(true));
      const col = world.createCollider(R.ColliderDesc.cuboid(0.1, 0.1, 0.1).setMass(1), body);
      ia.register(col, { kind: 'prop', body });
      world.step();
      const eye = { x: x0, y: 1.5, z: 1.1 }, fwd = { x: 0, y: 0, z: -1 };
      const grabbed = ia.begin(eye, fwd);
      ia.startThrow();
      for (let i = 0; i < 60; i++) { ia.hold(eye, fwd, DT); world.step(); }
      const speed = ia.releaseThrow(fwd);
      let landed = NaN;
      for (let i = 0; i < 240 && Number.isNaN(landed); i++) { world.step(); if (body.translation().y < 0.12) landed = -body.translation().z; }
      removeBodies([body]); world.removeCollider(f, false);
      const [lo, hi] = tuning.throw.expectedRange1kg;
      const pass = grabbed && landed >= lo && landed <= hi;
      return { name: 'interaction-throw-distance', pass, detail: `grabbed=${grabbed}; launched at ${speed.toFixed(2)} m/s; landed ${landed.toFixed(2)} m away (tuned range ${lo}–${hi} m)` };
    },
    'interaction-drawer-limits': () => {
      const x0 = 380, f = floor(x0), ia = new Interaction(R, world);
      const drawer = ia.addDrawer({ x: x0, y: 0.8, z: -3 }, { x: 0.5, y: 0.2, z: 0.45 }, { x: 0, y: 0, z: 1 }, 0.4);
      world.step();
      const front = { x: x0, y: 0.8, z: -2.775 };
      const at = (z: number) => { const eye = { x: x0, y: 1.6, z }; return { eye, dir: norm({ x: front.x - eye.x, y: front.y - eye.y, z: front.z - eye.z }) }; };
      const start = at(-1.9);
      const grabbed = ia.begin(start.eye, start.dir);
      const pos = () => drawer.body.translation().z - drawer.rest.z;
      for (let i = 0; i < 90; i++) { ia.hold({ ...start.eye, z: -1.9 + i / 60 }, start.dir, DT); world.step(); } // step back 1.5 m
      for (let i = 0; i < 30; i++) { ia.hold({ ...start.eye, z: -0.4 }, start.dir, DT); world.step(); }
      const out = pos();
      for (let i = 0; i < 120; i++) { ia.hold({ ...start.eye, z: -0.4 - i / 60 }, start.dir, DT); world.step(); } // push back in, past closed
      const shut = pos();
      ia.end();
      removeBodies([drawer.body]); world.removeCollider(f, false);
      const pass = grabbed && out <= drawer.travel + 0.01 && out >= drawer.travel - 0.04 && shut >= -0.01 && shut <= 0.03;
      return { name: 'interaction-drawer-limits', pass, detail: `grabbed=${grabbed}; pulled out to ${out.toFixed(3)} m (travel ${drawer.travel}); pushed in to ${shut.toFixed(3)} m` };
    },
  };
}
