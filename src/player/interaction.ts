// Interaction (MASTER_PLAN §3.5 item 7, §4.6, M1.4): a focus ray picks what is in reach; props are carried
// on a velocity spring (heavy ones are only dragged), thrown with a strength set by how long the throw
// button is held; doors and drawers are jointed bodies that the hand drags through their joint motors, so
// joint limits stop them. Tuning lives in content/interaction.json.
import type RAPIER from '@dimforge/rapier3d-compat';
import tuning from '../../content/interaction.json';

type V3 = { x: number; y: number; z: number };
export interface Prop { kind: 'prop'; body: RAPIER.RigidBody }
export interface Door { kind: 'door'; body: RAPIER.RigidBody; joint: RAPIER.RevoluteImpulseJoint; hinge: V3; restYaw: number; maxRad: number }
export interface Drawer { kind: 'drawer'; body: RAPIER.RigidBody; joint: RAPIER.PrismaticImpulseJoint; rest: V3; axis: V3; travel: number }
export type Interactable = Prop | Door | Drawer;

const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const yawQuat = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

/** Signed angle about +Y from horizontal vector a to b (three.js / Rapier right-handed convention). */
export function angleAboutY(a: V3, b: V3): number {
  return Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
}

/** Throw speed for a charge in [0, 1]: heavier things leave the hand slower. */
export function throwSpeed(charge: number, mass: number, t = tuning.throw): number {
  const c = Math.min(1, Math.max(0, charge));
  return (t.minSpeed + (t.maxSpeed - t.minSpeed) * c) * Math.min(1, Math.sqrt(t.referenceMass / Math.max(mass, 1e-3)));
}

export class Interaction {
  private items = new Map<number, Interactable>();
  held: { item: Interactable; grabDistance: number; grabLocal: V3 } | null = null;
  charge = 0;
  private charging = false;

  constructor(private readonly R: typeof RAPIER, private readonly world: RAPIER.World, private readonly exclude?: RAPIER.Collider, private readonly t = tuning) {}

  register(collider: RAPIER.Collider, item: Interactable): void { this.items.set(collider.handle, item); }

  /** A hinged door, `width` wide, standing on the floor with its hinge at `hinge`; closed it points along `restYaw`. */
  addDoor(hinge: V3, width: number, height: number, restYaw = 0): Door {
    const R = this.R;
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(hinge.x, hinge.y, hinge.z));
    const dir = { x: Math.cos(restYaw), y: 0, z: -Math.sin(restYaw) };
    const centre = add(hinge, { x: dir.x * width / 2, y: height / 2, z: dir.z * width / 2 });
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(centre.x, centre.y, centre.z).setRotation(yawQuat(restYaw)).setAngularDamping(1.5));
    const col = this.world.createCollider(R.ColliderDesc.cuboid(width / 2, height / 2, 0.025).setDensity(400), body);
    const params = R.JointData.revolute({ x: 0, y: height / 2, z: 0 }, { x: -width / 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const joint = this.world.createImpulseJoint(params, anchor, body, true) as RAPIER.RevoluteImpulseJoint;
    const maxRad = (this.t.door.maxOpenDeg * Math.PI) / 180;
    joint.setLimits(0, maxRad);
    joint.configureMotorVelocity(0, this.t.door.friction);
    const door: Door = { kind: 'door', body, joint, hinge, restYaw, maxRad };
    this.register(col, door);
    return door;
  }

  /** A drawer that slides out of a fixed cabinet along `axis` by up to `travel`. */
  addDrawer(rest: V3, size: V3, axis: V3, travel: number): Drawer {
    const R = this.R;
    const cabinet = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(rest.x, rest.y, rest.z));
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(rest.x, rest.y, rest.z).setLinearDamping(2));
    const col = this.world.createCollider(R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setDensity(300), body);
    const params = R.JointData.prismatic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, axis);
    params.limitsEnabled = true;
    params.limits = [0, travel];
    const joint = this.world.createImpulseJoint(params, cabinet, body, true) as RAPIER.PrismaticImpulseJoint;
    joint.configureMotorVelocity(0, this.t.drawer.friction);
    const drawer: Drawer = { kind: 'drawer', body, joint, rest, axis, travel };
    this.register(col, drawer);
    return drawer;
  }

  /** What the player looks at within reach. */
  focus(origin: V3, dir: V3): { item: Interactable; distance: number; point: V3 } | null {
    const hit = this.world.castRay(new this.R.Ray(origin, dir), this.t.reach, true, undefined, undefined, this.exclude);
    if (!hit) return null;
    const item = this.items.get(hit.collider.handle);
    return item ? { item, distance: hit.timeOfImpact, point: add(origin, dir, hit.timeOfImpact) } : null;
  }

  /** Interact pressed: grab what is in focus. */
  begin(origin: V3, dir: V3): boolean {
    const f = this.focus(origin, dir);
    if (!f) return false;
    const p = f.item.body.translation(), q = f.item.body.rotation();
    // grab point in the body's frame, so a door is held where it was touched
    const rel = sub(f.point, p);
    const inv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    this.held = { item: f.item, grabDistance: f.item.kind === 'prop' ? this.t.holdDistance : f.distance, grabLocal: rotate(inv, rel) };
    f.item.body.wakeUp();
    return true;
  }

  /** While held, each fixed step: move the hand point along the view ray and let the item follow. */
  hold(origin: V3, dir: V3, dt: number): void {
    const h = this.held;
    if (!h) return;
    const hand = add(origin, dir, h.grabDistance);
    const it = h.item;
    if (it.kind === 'door') {
      const restDir = { x: Math.cos(it.restYaw), y: 0, z: -Math.sin(it.restYaw) };
      const target = Math.min(it.maxRad, Math.max(0, angleAboutY(restDir, sub(hand, it.hinge))));
      it.joint.configureMotorPosition(target, this.t.door.motorStiffness, this.t.door.motorDamping);
    } else if (it.kind === 'drawer') {
      const grabRest = add(it.rest, h.grabLocal);
      const target = Math.min(it.travel, Math.max(0, dot(sub(hand, grabRest), it.axis)));
      it.joint.configureMotorPosition(target, this.t.drawer.motorStiffness, this.t.drawer.motorDamping);
    } else {
      const b = it.body, p = b.translation();
      const heavy = b.mass() > this.t.maxCarryMass;
      const goal = heavy ? { x: hand.x, y: p.y, z: hand.z } : hand; // too heavy to lift: drag along the floor
      const k = this.t.carry.stiffness * (heavy ? this.t.maxCarryMass / b.mass() : 1);
      let v = { x: (goal.x - p.x) * k, y: (goal.y - p.y) * k, z: (goal.z - p.z) * k };
      const s = Math.hypot(v.x, v.y, v.z);
      if (s > this.t.carry.maxSpeed) v = { x: v.x / s * this.t.carry.maxSpeed, y: v.y / s * this.t.carry.maxSpeed, z: v.z / s * this.t.carry.maxSpeed };
      b.setLinvel(heavy ? { x: v.x, y: b.linvel().y, z: v.z } : v, true);
      const w = b.angvel(), d = this.t.carry.angularDamping;
      b.setAngvel({ x: w.x * d, y: w.y * d, z: w.z * d }, true);
    }
    if (this.charging) this.charge = Math.min(1, this.charge + dt / this.t.throw.chargeSeconds);
  }

  /** Interact released: let go; doors and drawers keep only their friction. */
  end(): void {
    const it = this.held?.item;
    if (it?.kind === 'door') it.joint.configureMotorVelocity(0, this.t.door.friction);
    if (it?.kind === 'drawer') it.joint.configureMotorVelocity(0, this.t.drawer.friction);
    this.held = null;
    this.charging = false;
    this.charge = 0;
  }

  /** Throw button pressed while carrying a prop: start charging. */
  startThrow(): void { if (this.held?.item.kind === 'prop' && this.held.item.body.mass() <= this.t.maxCarryMass) { this.charging = true; this.charge = 0; } }

  /** Throw button released: throw along the view. Returns the launch speed, or 0 if nothing was thrown. */
  releaseThrow(dir: V3): number {
    if (!this.charging || this.held?.item.kind !== 'prop') return 0;
    const b = this.held.item.body;
    const speed = throwSpeed(this.charge, b.mass());
    b.setLinvel({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, true);
    this.held = null;
    this.charging = false;
    this.charge = 0;
    return speed;
  }
}

function rotate(q: { x: number; y: number; z: number; w: number }, v: V3): V3 {
  // v' = q v q*
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x };
}
