// Feel Lab, ?lab=1 (MASTER_PLAN §9 M1.7): one room with every surface and interactable so movement and
// handling can be judged before levels exist. Greybox: flat colours, no lightmap, a few lamps. It sits
// beside the corridor in the same physics world and is built only in lab mode.
import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { SoundEvents } from '../audio/soundEvents';
import type { Surface } from '../core/events';
import type { Interaction } from '../player/interaction';

export const LAB_ORIGIN = { x: 40, y: 0, z: 0 };
export const LAB_SPAWN = { x: LAB_ORIGIN.x, y: 0, z: 0 };

const COLOURS: Record<Surface, number> = {
  concrete: 0x77736c, concrete_wet: 0x3c3d40, metal: 0x6d747a, wood: 0x6b4a2f, tile: 0xb9b7ae, linoleum: 0x5d6b52, water: 0x26333a, gravel: 0x6f6a60,
};

export interface Lab { sync(): void }

export function buildFeelLab(scene: THREE.Scene, world: RAPIER.World, R: typeof RAPIER, sound: SoundEvents, interaction: Interaction, crateTemplate: THREE.Object3D): Lab {
  const X = LAB_ORIGIN.x;
  const synced: { body: RAPIER.RigidBody; mesh: THREE.Object3D }[] = [];
  const mat = (c: number, rough = 0.85, metal = 0) => new THREE.MeshStandardNodeMaterial({ color: c, roughness: rough, metalness: metal });
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material, rotX = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    mesh.position.set(x, y, z); mesh.rotation.x = rotX; mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
    return world.createCollider(R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(x, y, z).setRotation(q));
  };
  const label = (text: string, x: number, z: number) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d')!; g.fillStyle = '#e8dcc4'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(text, 128, 44);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    s.position.set(x, 2.3, z); s.scale.set(1.2, 0.3, 1); scene.add(s);
  };

  // floor strips, 10 m wide and 2.5 m deep, each tagged so footsteps change with it
  const strips: Surface[] = ['concrete', 'metal', 'wood', 'tile', 'linoleum', 'water', 'concrete'];
  strips.forEach((s, i) => {
    const z = -1.25 - i * 2.5;
    sound.tag(box(10, 0.2, 2.5, X, -0.1, z, mat(COLOURS[s], s === 'water' ? 0.08 : 0.85, s === 'metal' ? 0.6 : 0)), s);
    if (i < 6) label(s.toUpperCase(), X, z);
  });
  // room shell
  const wall = mat(0x4a4844);
  box(0.2, 3.2, 18.5, X - 5.1, 1.5, -8.25, wall); box(0.2, 3.2, 18.5, X + 5.1, 1.5, -8.25, wall);
  box(10.4, 3.2, 0.2, X, 1.5, 1.1, wall); box(10.4, 0.2, 18.5, X, 3.1, -8.25, mat(0x2a2927));
  // back wall with a doorway (1 m wide, 2.1 m high) and a hinged door in it
  box(4.5, 3.2, 0.2, X - 2.75, 1.5, -17.5, wall); box(4.5, 3.2, 0.2, X + 2.75, 1.5, -17.5, wall); box(1, 1.0, 0.2, X, 2.6, -17.5, wall);
  box(10, 0.2, 4, X, -0.1, -19.5, mat(COLOURS.concrete)); box(10.4, 3.2, 0.2, X, 1.5, -21.6, wall);
  const door = interaction.addDoor({ x: X - 0.48, y: 0, z: -17.5 }, 0.94, 2.06, 0);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.94, 2.06, 0.05), mat(0x5b4632, 0.7));
  doorMesh.castShadow = doorMesh.receiveShadow = true; scene.add(doorMesh); synced.push({ body: door.body, mesh: doorMesh });
  sound.tag(door.body.collider(0), 'wood');
  label('DOOR', X, -17.3);

  // stairs (6 × 0.17 m) and a landing on the left; ramps of 30° (walkable) and 50° (too steep) on the right
  const stairMat = mat(0x5f5d58);
  for (let i = 0; i < 6; i++) box(2, 0.17 * (i + 1), 0.35, X - 3.8, 0.085 * (i + 1), -3 - i * 0.35, stairMat);
  box(2, 1.02, 2, X - 3.8, 0.51, -6.1 - 0.175, stairMat);
  label('STAIRS', X - 3.8, -3.5);
  const ramp = (deg: number, z0: number, text: string) => {
    const a = (deg * Math.PI) / 180, len = 3;
    box(2, 0.1, len, X + 3.8, Math.sin(a) * len / 2, z0 - Math.cos(a) * len / 2, mat(0x6a655c), a);
    label(text, X + 3.8, z0 + 0.3);
  };
  ramp(30, -3, 'RAMP 30°'); ramp(50, -9, 'RAMP 50°');
  // crouch beam: underside at 1.2 m
  box(6, 0.3, 0.4, X - 1.5, 1.35, -13.5, mat(0x7a3d22)); label('BEAM 1.2 m', X - 1.5, -13.2);

  // drawers in a cabinet by the right wall
  const cab = mat(0x3f4a3f, 0.6, 0.3);
  box(0.6, 1.0, 0.1, X + 4.2, 0.5, -14.95, cab);
  for (let i = 0; i < 2; i++) {
    const d = interaction.addDrawer({ x: X + 4.2, y: 0.3 + i * 0.4, z: -14.7 }, { x: 0.5, y: 0.3, z: 0.45 }, { x: 0, y: 0, z: 1 }, 0.38);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.45), cab); m.castShadow = m.receiveShadow = true;
    scene.add(m); synced.push({ body: d.body, mesh: m });
    sound.tag(d.body.collider(0), 'metal');
  }
  label('DRAWERS', X + 4.2, -14.4);

  // props from light to heavy: bottles, boxes, a stool, a crate
  const prop = (shape: RAPIER.ColliderDesc, mesh: THREE.Object3D, x: number, y: number, z: number, surface: Surface) => {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCcdEnabled(true));
    const col = world.createCollider(shape, body);
    interaction.register(col, { kind: 'prop', body });
    sound.tag(col, surface, true);
    mesh.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    scene.add(mesh); synced.push({ body, mesh });
  };
  for (let i = 0; i < 3; i++) prop(R.ColliderDesc.cylinder(0.14, 0.04).setMass(0.4), new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 12), mat(0x2f4a35, 0.15)), X - 1 + i * 0.3, 0.2, -1.5, 'tile');
  for (let i = 0; i < 3; i++) prop(R.ColliderDesc.cuboid(0.12, 0.12, 0.12).setMass(1), new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), mat(0x8a6a44)), X + 1 + i * 0.4, 0.2, -1.6, 'wood');
  prop(R.ColliderDesc.cuboid(0.2, 0.25, 0.2).setMass(5), new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), mat(0x55504a, 0.6, 0.4)), X + 2.5, 0.3, -4, 'metal');
  prop(R.ColliderDesc.cuboid(0.45, 0.45, 0.45).setDensity(35), crateTemplate.clone(), X - 1.5, 0.5, -9, 'wood');

  // lamps: the lab has no bake, so a few real lights stand in
  for (const z of [-2, -8, -14]) {
    const l = new THREE.PointLight(0xffd9a8, 5, 10, 2); l.position.set(X, 2.8, z); scene.add(l);
  }
  const sync = () => synced.forEach(({ body, mesh }) => { mesh.position.copy(body.translation()); mesh.quaternion.copy(body.rotation()); });
  sync();
  return { sync };
}
