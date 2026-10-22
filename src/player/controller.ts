// First-person character controller (MASTER_PLAN §4.6, M1.2): Rapier kinematic capsule with step climbing,
// slope limit and ground snap; sprint with stamina; crouch that refuses to stand up under a low ceiling;
// lean that stops at walls; head-bob that can be turned off; a footstep event every stride (M1.5 gives it sound).
// Simulated at the fixed 60 Hz step (§4.3). All tuning lives in content/player.json.
import type RAPIER from '@dimforge/rapier3d-compat';
import tuning from '../../content/player.json';

export type Tuning = typeof tuning;
export type Gait = 'walk' | 'sprint' | 'crouch';
export interface ControlIntent { x: number; y: number; sprint: boolean; crouch: boolean; lean: number }
export interface FootstepEvent { position: { x: number; y: number; z: number }; gait: Gait; speed: number }

const DEG = Math.PI / 180;

/** Stamina in [0, 1]: drains while sprinting, refills after a pause. Pure, so it is unit-tested. */
export function updateStamina(stamina: number, sinceSprint: number, sprinting: boolean, dt: number, t = tuning.stamina): number {
  if (sprinting) return Math.max(0, stamina - dt / t.seconds);
  if (sinceSprint < t.regenDelay) return stamina;
  return Math.min(1, stamina + t.regenPerSecond * dt); // regenPerSecond is a fraction of a full bar
}

export class CharacterController {
  readonly collider: RAPIER.Collider;
  private readonly cc: RAPIER.KinematicCharacterController;
  private height: number;
  private vy = 0;
  private vel = { x: 0, z: 0 };
  private strideDist = 0;
  private leanNow = 0;
  stamina = 1;
  private sinceSprint = 99;
  crouched = false;
  grounded = false;
  gait: Gait = 'walk';
  speed = 0;
  headBob = true;
  onFootstep: (e: FootstepEvent) => void = () => {};

  constructor(private readonly R: typeof RAPIER, private readonly world: RAPIER.World, feet: { x: number; y: number; z: number }, private readonly t: Tuning = tuning) {
    this.height = t.standHeight;
    const half = this.capsuleHalf(this.height);
    this.collider = world.createCollider(R.ColliderDesc.capsule(half, t.radius).setTranslation(feet.x, feet.y + half + t.radius, feet.z));
    this.cc = world.createCharacterController(0.02);
    this.cc.setUp({ x: 0, y: 1, z: 0 });
    // Rapier's own autostep never engaged on a plain box step in tests, so stepping is done in tryStep()
    this.cc.setMaxSlopeClimbAngle(t.maxSlopeDeg * DEG);
    this.cc.setMinSlopeSlideAngle((t.maxSlopeDeg + 5) * DEG);
    this.cc.enableSnapToGround(t.snapToGround);
    this.cc.setApplyImpulsesToDynamicBodies(true);
  }

  private capsuleHalf(height: number) { return Math.max(0.01, height / 2 - this.t.radius); }

  get feet() { const p = this.collider.translation(); return { x: p.x, y: p.y - this.height / 2, z: p.z }; }

  /** Eye position plus camera roll for lean and offsets for head-bob, for the camera to follow. */
  eye(yaw: number): { x: number; y: number; z: number; roll: number } {
    const f = this.feet;
    const phase = (this.strideDist / this.strideLength()) * Math.PI * 2;
    const bobScale = this.headBob && this.grounded ? Math.min(1, this.speed / this.t.walkSpeed) : 0;
    const bobY = Math.abs(Math.sin(phase)) * this.t.headBob.amplitude * bobScale;
    const sway = Math.sin(phase) * this.t.headBob.sway * bobScale + this.leanNow * this.t.lean.offset;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // camera right vector for a yaw-only rotation
    return { x: f.x + rx * sway, y: f.y + this.height - this.t.eyeBelowTop + bobY, z: f.z + rz * sway, roll: -this.leanNow * this.t.lean.rollDeg * DEG };
  }

  private strideLength() { return this.t.strideLength[this.gait]; }

  private canStand(): boolean {
    const half = this.capsuleHalf(this.t.standHeight);
    const f = this.feet;
    const hit = this.world.intersectionWithShape({ x: f.x, y: f.y + half + this.t.radius + 0.01, z: f.z }, { x: 0, y: 0, z: 0, w: 1 },
      new this.R.Capsule(half, this.t.radius), undefined, undefined, this.collider);
    return hit === null;
  }

  private setHeight(h: number) {
    const f = this.feet;
    this.height = h;
    const half = this.capsuleHalf(h);
    this.collider.setShape(new this.R.Capsule(half, this.t.radius));
    this.collider.setTranslation({ x: f.x, y: f.y + half + this.t.radius, z: f.z });
  }

  /**
   * Stair step: lift by the step height (if there is room), move horizontally, drop back down. Kept only if
   * the capsule lands on something higher and gets further than the blocked move did.
   */
  private tryStep(p: { x: number; y: number; z: number }, desired: { x: number; z: number }, blockedH: number): { x: number; y: number; z: number } | null {
    const lift = this.t.stepHeight + 0.02;
    const half = this.capsuleHalf(this.height);
    const up = { x: p.x, y: p.y + lift, z: p.z };
    const blocked = this.world.intersectionWithShape(up, { x: 0, y: 0, z: 0, w: 1 }, new this.R.Capsule(half, this.t.radius), undefined, undefined, this.collider);
    if (blocked) return null;
    this.collider.setTranslation(up);
    this.cc.computeColliderMovement(this.collider, { x: desired.x, y: 0, z: desired.z });
    const h = this.cc.computedMovement();
    let result: { x: number; y: number; z: number } | null = null;
    const hLen = Math.hypot(h.x, h.z);
    if (hLen > blockedH + 1e-4) {
      // one frame's move leaves the capsule's rounded bottom short of the edge, so look for the landing a
      // radius further on; the capsule itself only moves this frame's distance
      const ahead = (hLen + this.t.radius * 1.15) / hLen;
      this.collider.setTranslation({ x: up.x + h.x * ahead, y: up.y + h.y, z: up.z + h.z * ahead });
      this.cc.computeColliderMovement(this.collider, { x: 0, y: -(lift + 0.05), z: 0 });
      const d = this.cc.computedMovement();
      // h.y counts: the rounded bottom can ride up an edge during the horizontal move
      const rise = lift + h.y + d.y;
      // and the landing must be walkable ground, or a steep ramp could be climbed in step-sized hops
      const land = this.collider.translation();
      const down = this.world.castRayAndGetNormal(new this.R.Ray({ x: land.x, y: land.y + d.y, z: land.z }, { x: 0, y: -1, z: 0 }),
        half + this.t.radius + 0.1, true, undefined, undefined, this.collider);
      const flat = !!down && down.normal.y >= Math.cos(this.t.maxSlopeDeg * DEG);
      if (this.cc.computedGrounded() && flat && rise > 0.01 && rise <= this.t.stepHeight + 0.01) result = { x: h.x, y: rise, z: h.z };
    }
    this.collider.setTranslation(p);
    return result;
  }

  /** One fixed step. `yaw` is the camera's heading; intent comes from Input.move() and actions. */
  step(intent: ControlIntent, yaw: number, dt: number): void {
    const t = this.t;
    // crouch: shrink at once, stand up only when there is room
    const wantCrouch = intent.crouch;
    if (wantCrouch && !this.crouched) { this.crouched = true; }
    if (!wantCrouch && this.crouched && this.canStand()) this.crouched = false;
    const target = this.crouched ? t.crouchHeight : t.standHeight;
    if (this.height !== target) {
      const next = this.height + Math.sign(target - this.height) * Math.min(Math.abs(target - this.height), t.crouchTransitionSpeed * dt);
      if (next > this.height && !this.canStand()) { /* hold until there is room */ } else this.setHeight(next);
    }

    const moving = Math.hypot(intent.x, intent.y) > 0.05;
    const sprinting = intent.sprint && moving && intent.y > 0 && !this.crouched && this.stamina > (this.gait === 'sprint' ? 0 : t.stamina.minToSprint);
    this.sinceSprint = sprinting ? 0 : this.sinceSprint + dt;
    this.stamina = updateStamina(this.stamina, this.sinceSprint, sprinting, dt);
    this.gait = this.crouched ? 'crouch' : sprinting ? 'sprint' : 'walk';
    const max = this.gait === 'crouch' ? t.crouchSpeed : this.gait === 'sprint' ? t.sprintSpeed : t.walkSpeed;

    // intent is camera-relative: y forward, x right
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const wantX = (fx * intent.y + rx * intent.x) * max, wantZ = (fz * intent.y + rz * intent.x) * max;
    const k = Math.min(1, t.acceleration * dt);
    this.vel.x += (wantX - this.vel.x) * k;
    this.vel.z += (wantZ - this.vel.z) * k;
    this.vy = this.grounded ? -0.5 : this.vy - t.gravity * dt; // small downward push keeps the snap engaged

    const desired = { x: this.vel.x * dt, y: this.vy * dt, z: this.vel.z * dt };
    this.cc.computeColliderMovement(this.collider, desired);
    let m = this.cc.computedMovement();
    const p = this.collider.translation();
    let grounded = this.cc.computedGrounded();
    const wantH = Math.hypot(desired.x, desired.z), gotH = Math.hypot(m.x, m.z);
    if (this.grounded && wantH > 1e-4 && gotH < wantH * 0.5) {
      const stepped = this.tryStep(p, desired, gotH);
      if (stepped) { m = stepped; grounded = true; }
    }
    this.collider.setTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    this.grounded = grounded;
    if (this.grounded && this.vy < 0) this.vy = 0;
    this.speed = Math.hypot(m.x, m.z) / dt;

    // lean toward the wanted side, but no further than the wall allows
    let leanTarget = intent.lean;
    if (leanTarget !== 0) {
      const e = this.eye(yaw);
      const dir = { x: Math.cos(yaw) * Math.sign(leanTarget), y: 0, z: -Math.sin(yaw) * Math.sign(leanTarget) };
      const hit = this.world.castRay(new this.R.Ray({ x: e.x, y: e.y, z: e.z }, dir), t.lean.offset + 0.15, true, undefined, undefined, this.collider);
      if (hit) leanTarget = Math.sign(leanTarget) * Math.max(0, (hit.timeOfImpact - 0.15) / t.lean.offset);
    }
    this.leanNow += (leanTarget - this.leanNow) * Math.min(1, t.lean.speed * dt);

    // footsteps: one event per stride while moving on the ground
    if (this.grounded && this.speed > 0.2) {
      const before = Math.floor(this.strideDist / this.strideLength());
      this.strideDist += this.speed * dt;
      if (Math.floor(this.strideDist / this.strideLength()) > before) this.onFootstep({ position: this.feet, gait: this.gait, speed: this.speed });
    }
  }
}
