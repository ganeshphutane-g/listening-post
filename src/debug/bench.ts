// In-game benchmark, ?bench=1 (MASTER_PLAN §9 M0.7): a fixed 60-second camera path at the display's real
// frame rate, then average FPS, 1% low, 95th-percentile frame time, draw calls, triangles, backend and GPU,
// with a copy button and a file download. The owner runs it on real hardware and sends the file back.
import * as THREE from 'three/webgpu';
import type { DisplayState } from '../render/display';
import { frameStats } from './benchStats';


export interface BenchContext {
  renderer: THREE.WebGPURenderer;
  pipeline: THREE.RenderPipeline;
  camera: THREE.PerspectiveCamera;
  backend: string;
  isWebGPU: boolean;
  tick(physics: boolean): void;
  display: () => DisplayState;
}

// ?bench=1 runs the full 60 s; ?bench=N with N ≥ 5 runs N seconds (the harness uses a short run)
const asked = Number(new URLSearchParams(location.search).get('bench'));
const DURATION_S = asked >= 5 ? asked : 60;
const WARMUP_S = 2; // first frames compile shaders; they are flown but not counted

// the corridor walk: entry → crates → lamp → far end and back toward the middle
const PATH = new THREE.CatmullRomCurve3([
  [0.35, 1.65, 1.2], [0.2, 1.62, -2.5], [-0.6, 1.6, -6.5], [0.5, 1.65, -9.5], [-0.3, 1.6, -13], [0.2, 1.65, -18], [0.0, 1.62, -12],
].map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
const LOOK = new THREE.CatmullRomCurve3([
  [-0.2, 1.4, -20], [-1.0, 0.9, -5.6], [0.4, 2.2, -7], [0.3, 1.5, -21.9], [0.3, 1.4, -21.9], [0.3, 1.5, -21.9], [0, 1.4, 0],
].map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');

async function gpuName(isWebGPU: boolean): Promise<string> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: unknown } | null> } }).gpu;
    if (isWebGPU && gpu) {
      const a = await gpu.requestAdapter();
      const i = a?.info as unknown as Record<string, string> | undefined;
      return [i?.vendor, i?.architecture, i?.device, i?.description].filter(Boolean).join(' / ') || 'unknown';
    }
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return (ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER)) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function runBench(ctx: BenchContext): void {
  const hud = document.getElementById('hud')!;
  const deltas: number[] = [];
  let start = -1, last = -1, interrupted = '';
  let maxDraw = 0, maxTris = 0, sumDraw = 0, sumTris = 0, counted = 0;
  document.addEventListener('visibilitychange', () => { if (document.hidden) interrupted = 'the tab was hidden during the run'; });
  const pos = new THREE.Vector3(), look = new THREE.Vector3();

  ctx.renderer.setAnimationLoop((now: number) => {
    if (start < 0) start = now;
    const t = (now - start) / 1000;
    const u = Math.min(1, t / (DURATION_S + WARMUP_S));
    PATH.getPointAt(u, pos);
    LOOK.getPointAt(u, look);
    ctx.camera.position.copy(pos);
    ctx.camera.lookAt(look);
    ctx.tick(true);
    ctx.pipeline.render(); // renderer.info is reset once per animation frame by three.js, so it counts the whole frame
    if (t > WARMUP_S && last >= 0) {
      deltas.push(now - last);
      const { drawCalls, triangles } = ctx.renderer.info.render;
      maxDraw = Math.max(maxDraw, drawCalls); maxTris = Math.max(maxTris, triangles);
      sumDraw += drawCalls; sumTris += triangles; counted++;
    }
    last = now;
    hud.textContent = t < WARMUP_S ? 'Benchmark: warming up…' : `Benchmark ${Math.floor(t - WARMUP_S)} / ${DURATION_S} s`;
    if (u >= 1) {
      ctx.renderer.setAnimationLoop(null);
      void finish();
    }
  });

  async function finish() {
    const d = ctx.display();
    const result = {
      game: 'Listening Post', build: __BUILD__, date: new Date().toISOString(),
      backend: ctx.backend, gpu: await gpuName(ctx.isWebGPU), userAgent: navigator.userAgent,
      window: `${d.cssW}x${d.cssH}`, devicePixelRatio: d.dpr, renderBuffer: `${d.bufferW}x${d.bufferH}`, tier: d.tier,
      ...frameStats(deltas),
      drawCallsAvg: Math.round(sumDraw / Math.max(1, counted)), drawCallsMax: maxDraw,
      trianglesAvg: Math.round(sumTris / Math.max(1, counted)), trianglesMax: maxTris,
      durationS: DURATION_S, valid: !interrupted && DURATION_S === 60, note: interrupted || (DURATION_S === 60 ? 'ok' : 'short run: not comparable with 60 s results'),
    };
    console.log('[bench]', JSON.stringify(result));
    hud.textContent = '';
    showResults(result);
  }
}

function showResults(result: Record<string, unknown>) {
  const json = JSON.stringify(result, null, 2);
  const panel = document.createElement('div');
  panel.id = 'bench-results';
  panel.innerHTML = `<h2>Benchmark results</h2>
    <p class="big">${result.avgFps} FPS average · ${result.low1Fps} FPS 1% low · ${result.p95Ms} ms 95th percentile</p>
    <pre></pre>
    <div class="row"><button id="bench-copy">Copy results</button><button id="bench-save">Download file</button><button id="bench-again">Run again</button></div>
    <p class="hint">Send the file (or the copied text) back. Run once with the address ending <code>?bench=1</code> and once with <code>?bench=1&amp;webgl=1</code>, in each browser.</p>`;
  panel.querySelector('pre')!.textContent = json;
  document.body.appendChild(panel);
  const copy = panel.querySelector<HTMLButtonElement>('#bench-copy')!;
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(json); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed: select the text instead'; }
  };
  panel.querySelector<HTMLButtonElement>('#bench-save')!.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `listening-post-bench-${String(result.backend).toLowerCase()}-${String(result.date).slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  panel.querySelector<HTMLButtonElement>('#bench-again')!.onclick = () => location.reload();
}
