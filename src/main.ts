// Browser pipeline test: Blender-baked lightmap + real-time flashlight shadows + volumetric fog
// + screen-space reflections + bloom + film grain (three.js r186, WebGPU with WebGL2 fallback)
// + Rapier physics crates. URL params: ?shot=1 (render fixed frames, then signal), ?webgl=1 (force WebGL2),
// ?view=lightmap|uv (debug views), ?nopost=1, ?frames=N, ?diag=1
import * as THREE from 'three/webgpu';
import {
  pass, mrt, output, normalView, metalness, roughness, vec2, vec3, sample, packNormalToRGB,
  unpackRGBToNormal, uniform, positionWorld, mx_fractal_noise_float, float, Fn, screenCoordinate,
  screenUV, time, texture3D, bumpMap,
} from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { bayer16 } from 'three/addons/tsl/math/Bayer.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { flipLightmapV } from './render/lightmap';
import { packReadback } from './render/readback';
import warehouseHDR from '@pmndrs/assets/hdri/warehouse.exr.js'; // CC0 HDRI shipped on npm

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const FORCE_WEBGL = params.has('webgl');
const SHOT_FRAMES = Number(params.get('frames') || 24);
const NOPOST = params.has('nopost');
const VOL = 10; // layer for volumetric lighting
const log = (...a: unknown[]) => console.log('[proto]', ...a);
const hud = document.getElementById('hud')!;

// fields of the concrete backends that the base Backend type does not declare
interface BackendInfo {
  isWebGPUBackend?: boolean;
  device?: {
    addEventListener(type: 'uncapturederror', cb: (e: { error?: { message?: string } }) => void): void;
    lost: Promise<{ reason: string; message: string }>;
  };
}
declare global { interface Window { __png?: string } }

const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: FORCE_WEBGL });
renderer.setPixelRatio(1);
// a hidden or collapsed host can report 0×0, and a zero-size swapchain invalidates every pass after it
const viewSize = () => [Math.max(1, innerWidth), Math.max(1, innerHeight)] as const;
renderer.setSize(...viewSize());
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
await renderer.init();
const backendInfo = renderer.backend as unknown as BackendInfo;
const isWebGPU = !!backendInfo.isWebGPUBackend;
const backend = isWebGPU ? 'WebGPU' : 'WebGL2';
if (isWebGPU && backendInfo.device) {
  const dev = backendInfo.device;
  dev.addEventListener('uncapturederror', (e) => log('GPU_ERROR', e.error && e.error.message ? e.error.message.slice(0, 300) : String(e)));
  dev.lost.then((info) => log('DEVICE_LOST', info.reason, info.message));
}
log('backend', backend);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020203);
const camera = new THREE.PerspectiveCamera(72, viewSize()[0] / viewSize()[1], 0.05, 60);
camera.position.set(0.35, 1.65, 1.2);
camera.lookAt(-0.2, 1.35, -20);
scene.add(camera);
addEventListener('resize', () => {
  const [w, h] = viewSize();
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

// ---------- environment light for dynamic objects (CC0 HDRI from @pmndrs/assets) ----------
const hdr = await new EXRLoader().loadAsync(warehouseHDR);
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = hdr;
scene.environmentIntensity = 0.06;

// ---------- static level: Blender mesh + baked lightmap ----------
const gltf = new GLTFLoader();
const lightmap = await new EXRLoader().setDataType(THREE.FloatType).loadAsync('./assets/corridor_lm.exr'); // half-float upload came out blown-out under WebGPU
lightmap.channel = 0;
const corridor = (await gltf.loadAsync('./assets/corridor.glb')).scene;
// world-space detail so no second UV set is needed: fractal noise drives albedo variation + bump
const grime = mx_fractal_noise_float(positionWorld.mul(1.7), 5, 2.0, 0.5).mul(0.5).add(0.5);
const pores = mx_fractal_noise_float(positionWorld.mul(9.0), 3, 2.0, 0.5);
corridor.traverse((obj) => {
  if (!(obj as THREE.Mesh).isMesh) return;
  const o = obj as THREE.Mesh;
  flipLightmapV(o.geometry.attributes.uv as THREE.BufferAttribute);
  const src = o.material as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardNodeMaterial();
  const isFloor = src.name === 'WetFloor';
  m.colorNode = vec3(src.color.r, src.color.g, src.color.b).mul(grime.mul(0.7).add(0.55));
  m.roughnessNode = isFloor ? grime.mul(0.35).add(0.05) : float(0.92);
  m.metalness = 0;
  m.normalNode = bumpMap(pores.mul(isFloor ? 0.15 : 0.6));
  m.lightMap = lightmap;
  m.lightMapIntensity = Math.PI;
  o.material = m;
  o.receiveShadow = true;
  o.castShadow = true;
});
scene.add(corridor);
const VIEW = params.get('view');
if (VIEW) { // debug views: lightmap through UVs, raw UVs
  const { texture: tex, uv: uvN } = await import('three/tsl');
  corridor.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const o = obj as THREE.Mesh;
    log('mesh', o.name, 'attributes', Object.keys(o.geometry.attributes).join(','));
    const m = new THREE.MeshBasicNodeMaterial();
    m.colorNode = VIEW === 'uv' ? vec3(uvN(), 0) : tex(lightmap, uvN()).rgb.mul(0.5);
    o.material = m;
  });
}

// ---------- real-time lights: flashlight (shadows) + lamps that only feed the fog ----------
const torch = new THREE.SpotLight(0xfff2e0, 14, 26, THREE.MathUtils.degToRad(20), 0.6, 2);
torch.position.set(0.25, -0.2, 0);
torch.castShadow = true;
torch.shadow.mapSize.set(1024, 1024);
torch.shadow.bias = -0.0004;
torch.layers.enable(VOL);
camera.add(torch);
torch.target.position.set(0.02, -0.04, -1);
camera.add(torch.target);
const fogLamp = new THREE.PointLight(0xffb873, 6, 9, 2);
fogLamp.position.set(0, 2.75, -7);
fogLamp.layers.set(VOL); // lights the fog only; its effect on walls is already baked
scene.add(fogLamp);
const fogRed = new THREE.PointLight(0xff2010, 9, 8, 2);
fogRed.position.set(0.3, 2.6, -17);
fogRed.layers.set(VOL);
scene.add(fogRed);

// ---------- volumetric fog (ray-marched at quarter resolution, blurred) ----------
function noise3D(size = 64) {
  const data = new Uint8Array(size ** 3), p = new ImprovedNoise();
  let i = 0;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    data[i++] = 128 + 128 * p.noise(x / size * 6, y / size * 6, z / size * 6);
  const t = new THREE.Data3DTexture(data, size, size, size);
  t.format = THREE.RedFormat; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}
const n3 = noise3D();
const fogMat = new THREE.VolumeNodeMaterial();
fogMat.steps = 14;
fogMat.offsetNode = bayer16(screenCoordinate);
// VolumeNodeMaterial passes positionRay; Fn's typings do not model it
fogMat.scatteringNode = Fn(({ positionRay }: any) => {
  const drift = vec3(time.mul(0.03), 0, time.mul(0.01));
  const d = texture3D(n3, positionRay.mul(0.12).add(drift).mod(1), 0).r;
  return d.mul(0.9).add(0.25).mul(0.12);
});
const fogBox = new THREE.Mesh(new THREE.BoxGeometry(4, 3.1, 24), fogMat);
fogBox.position.set(0, 1.55, -10);
fogBox.layers.set(VOL);
scene.add(fogBox);

// ---------- physics: Rapier ----------
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const fixed = (hx: number, hy: number, hz: number, x: number, y: number, z: number) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
fixed(2, 0.1, 12, 0, -0.1, -10); fixed(0.1, 1.6, 12, -2.1, 1.5, -10); fixed(0.1, 1.6, 12, 2.1, 1.5, -10);
for (const z of [-4, -10, -16]) for (const x of [-1.75, 1.75]) fixed(0.25, 1.5, 0.25, x, 1.5, z);
const crateMesh = (await gltf.loadAsync('./assets/crate.glb')).scene;
crateMesh.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
const crates: { body: RAPIER.RigidBody; mesh: THREE.Object3D }[] = [];
const spots = [[-1.2, 0.5, -5.5], [-1.2, 1.45, -5.5], [-0.22, 0.5, -5.6], [1.2, 0.9, -8.5], [1.1, 2.3, -8.4], [-0.9, 2.4, -12]];
spots.forEach(([x, y, z], i) => {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
    .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i * 0.37) % 0.8 - 0.4, 0))));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.45, 0.45, 0.45).setDensity(35), body);
  const mesh = crateMesh.clone();
  scene.add(mesh);
  crates.push({ body, mesh });
});
const syncCrates = () => crates.forEach(({ body, mesh }) => { mesh.position.copy(body.translation()); mesh.quaternion.copy(body.rotation()); });

// ---------- post-processing: SSR on the wet floor, fog, bloom, grain, SMAA ----------
const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
scenePass.setMRT(mrt({ output, normal: packNormalToRGB(normalView), metalrough: vec2(metalness, roughness) }));
const colorTex = scenePass.getTextureNode('output');
const depthTex = scenePass.getTextureNode('depth');
scenePass.getTexture('normal').type = THREE.UnsignedByteType;
scenePass.getTexture('metalrough').type = THREE.UnsignedByteType;
const normalTex = scenePass.getTextureNode('normal');
const mrTex = scenePass.getTextureNode('metalrough');
const sceneNormal = sample((uv) => unpackRGBToNormal(normalTex.sample(uv)));
const reflections = ssr(colorTex, depthTex, sceneNormal, { metalnessNode: mrTex.r, roughnessNode: mrTex.g });
reflections.maxDistance.value = 6; reflections.thickness.value = 0.04; reflections.quality.value = 0.5;
fogMat.depthNode = depthTex.sample(screenUV);
const volPass = pass(scene, camera, { depthBuffer: false });
const volLayer = new THREE.Layers(); volLayer.disableAll(); volLayer.enable(VOL);
volPass.setLayers(volLayer);
volPass.setResolutionScale(0.25);
const fog = gaussianBlur(volPass, uniform(0.6));
const lit = colorTex.add(reflections.rgb.mul(0.8)).add(fog.mul(0.9));
const glow = bloom(lit, 0.3, 0.4, 0.85);
pipeline.outputNode = NOPOST ? colorTex : smaa(film(lit.add(glow), uniform(0.22)));

// ---------- loop ----------
const flicker = new ImprovedNoise();
let frame = 0, t = 0;
const frameMs: number[] = [];
if (SHOT) { for (let i = 0; i < 300; i++) world.step(); }
syncCrates();
renderer.setAnimationLoop(() => {
  const t0 = performance.now();
  t += 1 / 60;
  const n = flicker.noise(t * 8, 0.5, 0);
  fogLamp.intensity = n < -0.35 ? 0.6 : 6 + n * 3;
  if (!SHOT) { world.step(); syncCrates(); }
  pipeline.render();
  frameMs.push(performance.now() - t0);
  frame++;
  hud.textContent = SHOT ? (frame % 2 ? "\u200b" : "") : `${backend}  frame ${frame}`; // a DOM change per frame keeps the capture path compositing the canvas
  if (SHOT && frame === SHOT_FRAMES) {
    const resting = crates.every(({ body }) => {
      const v = body.linvel(); return Math.hypot(v.x, v.y, v.z) < 0.05 && body.translation().y > 0.3;
    });
    const avg = frameMs.slice(4).reduce((a, b) => a + b, 0) / Math.max(1, frameMs.length - 4);
    log('RESULT', JSON.stringify({ backend, cratesResting: resting, cpuFrameMsAvg: +avg.toFixed(1),
      crateY: crates.map(({ body }) => +body.translation().y.toFixed(2)) }));
    hud.textContent = '';
    if (params.has('diag')) {
      const c2 = document.createElement('canvas'); c2.width = 96; c2.height = 54;
      const g = c2.getContext('2d')!; g.drawImage(renderer.domElement, 0, 0, 96, 54);
      const px = g.getImageData(0, 0, 96, 54).data; let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
      log('CANVAS_MEAN', (sum / (px.length / 4) / 3).toFixed(1));
    }
    renderer.setAnimationLoop(null);
    readback().then(() => { document.title = 'SHOT_READY'; });
  }
});

// Deterministic screenshot: render the final frame into a render target and read the pixels back,
// so automated checks do not depend on the browser compositor (its capture came back blank under WebGPU)
async function readback() {
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const rt = new THREE.RenderTarget(w, h, { type: THREE.UnsignedByteType });
  renderer.setRenderTarget(rt); pipeline.render(); renderer.setRenderTarget(null);
  const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; const img = g.createImageData(w, h);
  img.data.set(packReadback(px as Uint8Array, w, h, !isWebGPU));
  g.putImageData(img, 0, 0);
  window.__png = c.toDataURL('image/png');
}
