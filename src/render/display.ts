// Responsive display for laptop and desktop browsers (MASTER_PLAN §4.10, D-008, D-010): any window size,
// aspect ratio, device pixel ratio, browser zoom and fullscreen, without stretching.
import type * as THREE from 'three/webgpu';
import config from '../../content/display.json';

export type Tier = keyof typeof config.tiers;
const DEG = Math.PI / 180;

/**
 * Pixel ratio for the render buffer: the device ratio (capped) times the player's render scale, lowered
 * until the buffer fits the tier's pixel budget. A 1440×900 Retina laptop at 2× would otherwise render
 * 5.2 MP every frame, more than the Medium tier allows.
 */
export function pixelRatioFor(cssW: number, cssH: number, dpr: number, renderScale: number, maxPixels: number): number {
  let ratio = Math.min(dpr, config.maxDevicePixelRatio) * renderScale;
  const pixels = cssW * cssH * ratio * ratio;
  if (pixels > maxPixels) ratio = Math.sqrt(maxPixels / (cssW * cssH));
  return Math.max(config.minPixelRatio, ratio);
}

/**
 * Vertical field of view for a window aspect ratio ("Hor+"): the vertical view stays fixed and wider
 * windows see more to the sides, between 4:3 and 21:9. Narrower windows keep the 4:3 horizontal view
 * (so a tall window does not become a keyhole); wider ones keep the 21:9 horizontal view (so an
 * ultrawide does not bend into a fisheye).
 */
export function verticalFovFor(aspect: number, fovVertical16x9 = config.fovVertical16x9): number {
  const a = Math.min(Math.max(aspect, config.aspectClamp.min), config.aspectClamp.max);
  const halfH = Math.atan(Math.tan((fovVertical16x9 * DEG) / 2) * a);
  return (2 * Math.atan(Math.tan(halfH) / aspect)) / DEG;
}

export function horizontalFov(fovVertical: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((fovVertical * DEG) / 2) * aspect)) / DEG;
}

export interface DisplayState { cssW: number; cssH: number; dpr: number; pixelRatio: number; bufferW: number; bufferH: number; fovV: number; fovH: number; aspect: number; tier: Tier }

/** Keeps renderer size, pixel ratio and camera in step with the window. Returns a function reporting the state. */
export function installDisplay(renderer: THREE.WebGPURenderer, camera: THREE.PerspectiveCamera, tier: Tier = config.defaultTier as Tier): () => DisplayState {
  let state!: DisplayState;
  const apply = () => {
    // a hidden or collapsed host can report 0×0, and a zero-size swapchain invalidates every pass after it
    const cssW = Math.max(1, innerWidth), cssH = Math.max(1, innerHeight);
    const dpr = devicePixelRatio || 1;
    const pixelRatio = pixelRatioFor(cssW, cssH, dpr, config.renderScale, config.tiers[tier].maxPixels);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(cssW, cssH);
    const aspect = cssW / cssH;
    camera.aspect = aspect;
    camera.fov = verticalFovFor(aspect);
    camera.updateProjectionMatrix();
    const buf = renderer.domElement;
    state = { cssW, cssH, dpr, pixelRatio, bufferW: buf.width, bufferH: buf.height, fovV: camera.fov, fovH: horizontalFov(camera.fov, aspect), aspect, tier };
  };
  apply();
  addEventListener('resize', apply);
  // browser zoom and moving the window to another screen change the pixel ratio, sometimes without a resize
  const watchRatio = () => {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { apply(); watchRatio(); }, { once: true });
  };
  watchRatio();
  addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.altKey) { e.preventDefault(); void toggleFullscreen(); }
  });
  return () => state;
}

/** Alt+Enter, and the settings menu later (M1.6). Safari before 16.4 only has the prefixed call. */
export async function toggleFullscreen(): Promise<void> {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement || doc.webkitFullscreenElement) {
    if (document.exitFullscreen) await document.exitFullscreen(); else doc.webkitExitFullscreen?.();
  } else if (el.requestFullscreen) {
    await el.requestFullscreen();
  } else {
    el.webkitRequestFullscreen?.();
  }
}
