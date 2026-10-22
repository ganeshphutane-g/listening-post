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
      // playtest 1: grab the door and walk at it; it swings away and stops at its limit; back off and it follows
      const x0 = 340, f = floor(x0), ia = new Interaction(R, world);
      const hinge = { x: x0, y: 0, z: -3 };
      const door = ia.addDoor(hinge, 0.9, 2.0, 0);
      world.step();
      const grabAt = { x: x0 + 0.65, y: 1.05, z: -3 };
      const eyeAt = (z: number) => ({ x: x0 + 0.55, y: 1.6, z });
      const dir = norm({ x: grabAt.x - eyeAt(-1.9).x, y: grabAt.y - 1.6, z: grabAt.z + 1.9 });
      const grabbed = ia.begin(eyeAt(-1.9), dir);
      for (let i = 0; i <= 60; i++) { ia.hold(eyeAt(-1.9 - 0.35 * (i / 60)), dir, DT); world.step(); } // a short step forward
      for (let i = 0; i < 30; i++) { ia.hold(eyeAt(-2.25), dir, DT); world.step(); }
      const opened = doorYaw(door.body);
      for (let i = 0; i <= 60; i++) { ia.hold(eyeAt(-2.25 - 0.8 * (i / 60)), dir, DT); world.step(); } // keep walking: the stop holds
      for (let i = 0; i < 30; i++) { ia.hold(eyeAt(-3.05), dir, DT); world.step(); }
      const pushed = doorYaw(door.body);
      for (let i = 0; i <= 90; i++) { ia.hold(eyeAt(-3.05 + 1.3 * (i / 90)), dir, DT); world.step(); } // back away past the start
      for (let i = 0; i < 30; i++) { ia.hold(eyeAt(-1.75), dir, DT); world.step(); }
      const closed = doorYaw(door.body);
      ia.end();
      removeBodies([door.body]);
      // pressed against the closed door, the body cannot move, but pressing forward still pushes it open
      const door2 = ia.addDoor({ x: x0 + 4, y: 0, z: -3 }, 0.9, 2.0, 0); world.step();
      const eye2 = { x: x0 + 4.55, y: 1.6, z: -2.7 };
      const dir2 = norm({ x: 0.1, y: -0.55, z: -0.3 });
      const grabbed2 = ia.begin(eye2, dir2);
      for (let i = 0; i < 60; i++) { ia.hold(eye2, dir2, DT, { x: 0, y: 0, z: -1.6 }); world.step(); }
      const pressed = doorYaw(door2.body);
      ia.end(); removeBodies([door2.body]); world.removeCollider(f, false);
      const pass = grabbed && opened > 45 && pushed <= tuning.door.maxOpenDeg + 3 && pushed > opened && closed < 10 && grabbed2 && pressed > 45;
      return { name: 'interaction-door-drag', pass, detail: `grabbed=${grabbed}; a 0.35 m step opened it to ${opened.toFixed(1)}°; walking on: ${pushed.toFixed(1)}° (limit ${tuning.door.maxOpenDeg}°); backing away closed it to ${closed.toFixed(1)}°; pressing forward while touching it: ${pressed.toFixed(1)}°` };
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
