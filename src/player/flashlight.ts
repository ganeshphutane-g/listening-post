// The flashlight (MASTER_PLAN §3.5 item 9, §4.4 step 3, M1.3): a shadowed spot light with a reflector beam pattern,
// trailing the camera slightly, on a battery that drains while lit and makes the beam fade and flicker
// when low. Toggled with F. Tuning lives in content/flashlight.json.
import * as THREE from 'three/webgpu';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import tuning from '../../content/flashlight.json';

/** Battery charge in [0, 1]; drains only while the light is on. Pure, so it is unit-tested. */
export class Battery {
  constructor(public charge = 1, private readonly drainSeconds = tuning.battery.drainSeconds) {}
  update(dt: number, on: boolean): void {
    if (on) this.charge = Math.max(0, this.charge - dt / this.drainSeconds);
  }
  get empty(): boolean { return this.charge <= 0; }
}

/** Brightness factor for a charge level: full above `low`, fading to `lowest` and flickering below it. */
export function batteryLevel(charge: number, noise: number, b = tuning.battery, f = tuning.flicker): number {
  if (charge <= 0) return 0;
  if (charge >= b.low) return 1;
  const fade = b.lowestIntensity + (1 - b.lowestIntensity) * (charge / b.low);
  const dip = noise > f.dipThreshold ? f.dipDepth * (1 - charge / b.low) : 0; // dips grow as the charge falls
  return fade * (1 - dip);
}

/** Brightness across the beam at `r` (0 = centre, 1 = edge of the cone): hot centre, dark ring, bright ring, halo. */
export function reflectorProfile(r: number): number {
  if (r >= 1) return 0;
  const hot = Math.exp(-((r / 0.2) ** 2));
  const ring = 0.55 * Math.exp(-(((r - 0.56) / 0.12) ** 2));
  const halo = 0.32 * (1 - r) ** 0.6;
  const dark = 1 - 0.4 * Math.exp(-(((r - 0.38) / 0.06) ** 2));
  const edge = Math.min(1, (1 - r) / 0.15); // soft cut at the rim instead of a hard circle
  return Math.min(1, (hot + ring + halo) * dark) * edge;
}

/**
 * The beam pattern as an IES-style profile: brightness by angle from the beam axis, u = angle / π.
 * IESSpotLight reads only this curve (no projection frustum), so the pattern has no square edge and the
 * spill is not clipped, which a projected cookie map did to us. A 1970s reflector torch looks like this.
 */
export function makeReflectorProfile(coneDeg: number, width = 512): THREE.DataTexture {
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const angleDeg = ((i + 0.5) / width) * 180;
    const v = Math.round(reflectorProfile(angleDeg / coneDeg) * 255);
    data.set([v, v, v, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Flashlight {
  readonly light: THREE.IESSpotLight;
  readonly battery = new Battery();
  on = true;
  private readonly flicker = new ImprovedNoise();
  private time = 0;
  private readonly aim = new THREE.Quaternion();
  private readonly tmp = new THREE.Vector3();
  private static readonly FORWARD = new THREE.Vector3(0, 0, -1);

  constructor(scene: THREE.Scene, private readonly camera: THREE.Camera, volumetricLayer: number) {
    const t = tuning;
    // the cone angle bounds the shadow camera; the beam shape itself comes from the profile below
    this.light = new THREE.IESSpotLight(t.color, t.intensity, t.distance, THREE.MathUtils.degToRad(t.angleDeg + 4), 0, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(t.shadowMapSize, t.shadowMapSize);
    this.light.shadow.bias = -0.0004;
    this.light.iesMap = makeReflectorProfile(t.angleDeg);
    this.light.layers.enable(volumetricLayer); // the beam lights the fog
    scene.add(this.light, this.light.target);
    this.snap();
  }

  toggle(): void { this.on = !this.on; }

  /** Jump straight to the camera (after a teleport or a harness camera cut). */
  snap(): void {
    this.camera.updateMatrixWorld();
    this.camera.getWorldQuaternion(this.aim);
    this.place();
  }

  private place(): void {
    const [ox, oy, oz] = tuning.offset;
    this.camera.getWorldPosition(this.light.position);
    this.light.position.add(this.tmp.set(ox, oy, oz).applyQuaternion(this.aim));
    this.light.target.position.copy(this.light.position).add(this.tmp.copy(Flashlight.FORWARD).applyQuaternion(this.aim));
  }

  /** One fixed step: battery, flicker, and the beam easing toward where the camera looks. */
  update(dt: number): void {
    this.time += dt;
    this.battery.update(dt, this.on);
    const camQ = this.camera.getWorldQuaternion(new THREE.Quaternion());
    this.aim.slerp(camQ, 1 - Math.exp(-tuning.lagPerSecond * dt));
    this.place();
    const level = batteryLevel(this.battery.charge, this.flicker.noise(this.time * tuning.flicker.rate, 3.7, 0));
    this.light.intensity = this.on ? tuning.intensity * level : 0;
  }
}
