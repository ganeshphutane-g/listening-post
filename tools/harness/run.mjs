// Electron harness (MASTER_PLAN §8.8, M0.3). Serves dist/, opens the game with ?harness=1 and drives it
// through window.__harness. Any page error, GPU validation error or lost device fails the run.
//
//   electron tools/harness/run.mjs <command> [options]      (normally via `node tools/harness/launch.mjs`)
//   commands: shoot [stop]   one still per backend → tests/visual/out/shoot/
//             tour           every stop in tests/visual/tour.json, diffed against baselines
//             scenarios      every page-side scenario (physics checks)
//             bench          CPU frame time, draw calls, triangles (budgets come with §4.11)
//             benchpage      runs the real ?bench=N page (requestAnimationFrame, results panel) for 5 s
//             responsive     resizes the running game through laptop window sizes (D-008, M0.9): no stretching,
//                            pixel budget kept, frames render; then checks the phone/tablet notice
//             menus          walks every menu (scenario 'menus'), reloads, and checks the settings persisted
//             selftest       loads a page that throws; passes only if the error is caught
//   options:  --backend webgpu|webgl|both (default both)   --size 960x540   --dpr 1
//             --mode native|vulkan|swiftshader (default: native on macOS, vulkan on Linux)
//             --sizes 1280x720,1920x1080   window sizes for `responsive`
//             --view lightmap|uv   tour a debug view (own baselines, e.g. webgpu-view-lightmap/)
//             --update   write current frames as the new baselines
import { app, BrowserWindow, nativeImage } from 'electron';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(process.argv.findIndex((a) => a.endsWith('run.mjs')) + 1);
const VALUED = new Set(['--backend', '--size', '--dpr', '--mode', '--sizes', '--view']);
const positionals = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes(`--${name}`);
const [command = 'tour', positional] = positionals;
const BACKENDS = { both: ['webgpu', 'webgl'], webgpu: ['webgpu'], webgl: ['webgl'] }[opt('backend', 'both')];
const [W, H] = opt('size', '960x540').split('x').map(Number);
const DPR = Number(opt('dpr', '1'));
const MODE = opt('mode', process.platform === 'linux' ? 'vulkan' : 'native');
const PLATFORM = `${process.platform}-${MODE}`;
const VIEW = opt('view', '');
const MAX_DIFF = 0.002; // fraction of pixels allowed to differ from a baseline
const OUT = join(ROOT, 'tests/visual/out', VIEW ? `${command}-view-${VIEW}` : command);
const BASELINES = join(ROOT, 'tests/visual/baselines', PLATFORM);
const TIMEOUT_MS = 10 * 60 * 1000;
const SIZES = opt('sizes', '1280x720,1366x768,1440x900,1920x1080,3440x1440').split(',').map((s) => s.split('x').map(Number));
const MAX_PIXELS = JSON.parse(await readFile(join(ROOT, 'content/display.json'), 'utf8'));

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('force-device-scale-factor', String(DPR));
if (MODE === 'vulkan') { app.commandLine.appendSwitch('enable-features', 'Vulkan'); app.commandLine.appendSwitch('use-vulkan', 'native'); }
if (MODE === 'swiftshader') app.commandLine.appendSwitch('use-webgpu-adapter', 'swiftshader');
app.dock?.hide();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.exr': 'image/x-exr', '.png': 'image/png', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm' };
function serve(dir) {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = join(dir, path.endsWith('/') ? path + 'index.html' : path);
      if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body);
      } catch { res.writeHead(404).end(); }
    });
    server.listen(0, '127.0.0.1', () => ok(server));
  });
}

const errors = [];
const log = (...a) => console.log('[harness]', ...a);
const fail = (msg) => {
  errors.push(msg);
  if (command === 'selftest' && msg.includes('PLANTED_ERROR')) log('caught the planted error (expected):', msg);
  else console.error('[harness] ERROR', msg);
};
const exists = (p) => access(p).then(() => true, () => false);

async function openGame(win, base, backend, extra = '') {
  const url = `${base}/?harness=1${backend === 'webgl' ? '&webgl=1' : ''}${extra}`;
  await win.loadURL(url);
  const t0 = Date.now();
  while (win.webContents.getTitle() !== 'HARNESS_READY') {
    if (errors.length) throw new Error(`page failed during start-up (${backend})`);
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error(`timed out waiting for HARNESS_READY (${backend})`);
    await new Promise((r) => setTimeout(r, 200));
  }
  const got = await win.webContents.executeJavaScript('window.__harness.backend');
  const want = backend === 'webgl' ? 'WebGL2' : 'WebGPU';
  if (got !== want) fail(`asked for ${want}, page runs ${got}`);
  log(`${backend}: ready in ${((Date.now() - t0) / 1000).toFixed(1)} s (${got})`);
}

const call = (win, expr) => win.webContents.executeJavaScript(expr);
const png = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');

async function compare(name, backend, current) {
  const basePath = join(BASELINES, backend, `${name}.png`);
  await mkdir(dirname(join(OUT, name)), { recursive: true });
  await mkdir(dirname(basePath), { recursive: true });
  if (flag('update') || !(await exists(basePath))) {
    await writeFile(basePath, current);
    log(`${backend}/${name}: baseline ${flag('update') ? 'updated' : 'created (none existed)'}`);
    return { name, backend, diff: 0, baseline: 'new' };
  }
  const a = nativeImage.createFromBuffer(current), b = nativeImage.createFromPath(basePath);
  const sa = a.getSize(), sb = b.getSize();
  if (sa.width !== sb.width || sa.height !== sb.height) {
    fail(`${backend}/${name}: size ${sa.width}x${sa.height} differs from baseline ${sb.width}x${sb.height}`);
    return { name, backend, diff: 1 };
  }
  const out = Buffer.alloc(sa.width * sa.height * 4);
  const bad = pixelmatch(a.toBitmap(), b.toBitmap(), out, sa.width, sa.height, { threshold: 0.1 });
  const frac = bad / (sa.width * sa.height);
  if (frac > MAX_DIFF) {
    await writeFile(join(OUT, `${backend}-${name.replace(/\//g, '-')}.diff.png`), nativeImage.createFromBitmap(out, sa).toPNG());
    fail(`${backend}/${name}: ${(frac * 100).toFixed(2)}% of pixels differ from the baseline (limit ${MAX_DIFF * 100}%)`);
  }
  log(`${backend}/${name}: ${(frac * 100).toFixed(3)}% differ`);
  return { name, backend, diff: +frac.toFixed(5) };
}

// The command-line scale factor loses to a Retina screen on macOS; the DevTools override applies to the page
// itself. width/height 0 keep the real window size, so resizing still works. Needs a loaded page.
async function setPixelRatio(win) {
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: DPR, mobile: false });
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const dist = join(ROOT, 'dist');
  if (!(await exists(join(dist, 'index.html')))) throw new Error('dist/ is missing: run `npm run build` first');
  const server = await serve(dist);
  const base = `http://127.0.0.1:${server.address().port}`;
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false, enableLargerThanScreen: true,
    webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => {
    const { level, message } = e;
    if (level === 'error' || /GPU_ERROR|DEVICE_LOST/.test(message)) fail(`page: ${message.slice(0, 400)}`);
    else if (flag('verbose')) log('page:', message.slice(0, 300));
  });
  win.webContents.on('render-process-gone', (_e, d) => fail(`renderer process gone: ${d.reason}`));
  win.webContents.on('did-fail-load', (_e, code, desc) => fail(`load failed: ${code} ${desc}`));
  const probe = await (async () => { await win.loadURL(`${base}/`); await setPixelRatio(win); return call(win, `(async()=>{ if(!navigator.gpu) return 'navigator.gpu missing'; const a = await navigator.gpu.requestAdapter(); if(!a) return 'no adapter'; const i = a.info || {}; return [i.vendor, i.architecture, i.description].filter(Boolean).join(' / ') || 'adapter'; })()`); })();
  log(`platform ${PLATFORM}, window ${W}x${H} @${DPR}x, WebGPU adapter: ${probe}`);
  const report = { command, platform: PLATFORM, adapter: probe, size: `${W}x${H}`, dpr: DPR, results: [] };

  if (command === 'selftest') {
    await openGame(win, base, BACKENDS[0], '&plant=1').catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const caught = errors.some((e) => e.includes('PLANTED_ERROR'));
    errors.length = 0;
    if (!caught) fail('selftest: the planted page error was not detected');
    else log('selftest: planted page error detected — harness fails runs on page errors');
    report.results.push({ planted: caught });
  } else if (command === 'menus') {
    await openGame(win, base, BACKENDS[0]);
    const r = await call(win, `window.__harness.scenario('menus')`);
    (r.pass ? log : fail)(`menus: ${r.pass ? 'PASS' : 'FAIL'} ${r.detail}`);
    await openGame(win, base, BACKENDS[0]); // reload: settings must come back from storage
    const after = await call(win, `(() => {
      const saved = JSON.parse(localStorage.getItem('listening-post.settings.v1') || 'null');
      document.getElementById('btn-title-settings').click();
      return { saved: saved && { sens: saved.mouseSensitivity, invert: saved.invertY, flashlight: saved.bindings.flashlight[0] },
        ui: { sens: document.getElementById('set-sens').value, invert: document.getElementById('set-invert').checked } };
    })()`);
    const ok = after.saved?.sens === 33 && after.saved?.invert === true && after.saved?.flashlight === 'KeyG' && after.ui.sens === '33' && after.ui.invert === true;
    (ok ? log : fail)(`settings after reload: ${JSON.stringify(after)}${ok ? ' — persisted' : ''}`);
    report.results.push(r, after);
  } else if (command === 'benchpage') {
    for (const backend of BACKENDS) {
      let result = null;
      const onMsg = (e) => { if (e.message.startsWith('[bench] ')) result = JSON.parse(e.message.slice(8)); };
      win.webContents.on('console-message', onMsg);
      await win.loadURL(`${base}/?bench=5${backend === 'webgl' ? '&webgl=1' : ''}`);
      const t0 = Date.now();
      while (!result && !errors.length && Date.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 250));
      win.webContents.off('console-message', onMsg);
      if (!result) { fail(`${backend}: benchmark page gave no result in 120 s (is requestAnimationFrame running?)`); break; }
      const panel = await call(win, `!!document.querySelector('#bench-results #bench-copy') && !!document.querySelector('#bench-results #bench-save')`);
      if (!panel) fail(`${backend}: results panel or its buttons are missing`);
      const want = backend === 'webgl' ? 'WebGL2' : 'WebGPU';
      if (result.backend !== want) fail(`${backend}: benchmark ran on ${result.backend}`);
      for (const k of ['avgFps', 'low1Fps', 'p95Ms', 'drawCallsMax', 'trianglesMax', 'gpu', 'build']) if (result[k] === undefined || result[k] === 0) fail(`${backend}: result field ${k} is ${result[k]}`);
      log(`${backend}: ${result.frames} frames, ${result.avgFps} FPS avg, ${result.low1Fps} FPS 1% low, p95 ${result.p95Ms} ms, ${result.drawCallsMax} draws, ${result.trianglesMax} tris, gpu "${result.gpu}", build ${result.build}`);
      report.results.push(result);
    }
  } else {
    const tour = JSON.parse(await readFile(join(ROOT, 'tests/visual/tour.json'), 'utf8')).stops;
    for (const backend of BACKENDS) {
      await openGame(win, base, backend, VIEW ? `&view=${VIEW}` : '');
      if (command === 'shoot') {
        const stop = tour.find((s) => s.name === positional) ?? tour[0];
        const { png: data } = await call(win, `window.__harness.still(${JSON.stringify(stop)})`);
        const file = join(OUT, `${backend}-${stop.name}.png`);
        await writeFile(file, png(data));
        log(`${backend}: saved ${file}`);
        report.results.push({ backend, stop: stop.name, file });
      } else if (command === 'tour') {
        for (const stop of tour) {
          const t0 = Date.now();
          const { png: data } = await call(win, `window.__harness.still(${JSON.stringify(stop)})`);
          const buf = png(data);
          await writeFile(join(OUT, `${backend}-${stop.name}.png`), buf);
          report.results.push({ ...(await compare(stop.name, VIEW ? `${backend}-view-${VIEW}` : backend, buf)), seconds: (Date.now() - t0) / 1000 });
        }
      } else if (command === 'scenarios') {
        for (const name of await call(win, 'window.__harness.scenarios()')) {
          const r = await call(win, `window.__harness.scenario(${JSON.stringify(name)})`);
          (r.pass ? log : fail)(`${backend}/${name}: ${r.pass ? 'PASS' : 'FAIL'} ${r.detail}`);
          report.results.push({ backend, ...r });
        }
      } else if (command === 'responsive') {
        const cfg = MAX_PIXELS;
        const budget = cfg.tiers[cfg.defaultTier].maxPixels;
        for (const [w, h] of SIZES) {
          win.setContentSize(w, h);
          const t0 = Date.now();
          let d = await call(win, 'window.__harness.display()');
          while ((d.cssW !== w || d.cssH !== h) && Date.now() - t0 < 5000) {
            await new Promise((r) => setTimeout(r, 100));
            d = await call(win, 'window.__harness.display()');
          }
          const label = `${w}x${h}-dpr${DPR}`; // no '@2x' in file names: nativeImage reads those as half-size Retina assets
          const problems = [];
          if (d.cssW !== w || d.cssH !== h) problems.push(`page is ${d.cssW}x${d.cssH}, window asked for ${w}x${h}`);
          if (Math.abs(d.bufferW / d.bufferH - w / h) > 0.01) problems.push(`buffer ${d.bufferW}x${d.bufferH} is stretched against the ${w}x${h} window`);
          if (Math.abs(d.aspect - w / h) > 1e-6) problems.push(`camera aspect ${d.aspect} != ${w / h}`);
          if (d.bufferW * d.bufferH > budget * 1.02 && d.pixelRatio > cfg.minPixelRatio) problems.push(`buffer ${d.bufferW}x${d.bufferH} exceeds the ${cfg.defaultTier} budget`);
          const stop = (await readFile(join(ROOT, 'tests/visual/tour.json'), 'utf8').then(JSON.parse)).stops[0];
          const still = await call(win, `window.__harness.still(${JSON.stringify(stop)})`);
          const after = await call(win, 'window.__harness.display()'); // a pixel-ratio change mid-capture shows up here
          if (still.width !== d.bufferW || still.height !== d.bufferH || after.bufferW !== d.bufferW) problems.push(`still is ${still.width}x${still.height}, buffer was ${d.bufferW}x${d.bufferH} before and ${after.bufferW}x${after.bufferH} after`);
          const buf = png(still.png);
          await writeFile(join(OUT, `${backend}-${label}.png`), buf);
          const cmp = await compare(`responsive/${label}`, backend, buf);
          problems.forEach((m) => fail(`${backend}/${label}: ${m}`));
          log(`${backend}/${label}: buffer ${d.bufferW}x${d.bufferH} (ratio ${d.pixelRatio.toFixed(2)}), fov ${d.fovV.toFixed(1)}° v / ${d.fovH.toFixed(1)}° h${problems.length ? '' : ' — ok'}`);
          report.results.push({ backend, size: label, ...d, problems, diff: cmp.diff });
        }
      } else if (command === 'benchpage') {
        throw new Error('benchpage runs once, outside the backend loop');
      } else if (command === 'bench') {
        const r = await call(win, 'window.__harness.bench()');
        log(`${backend}: ${JSON.stringify(r)}`);
        report.results.push(r);
      } else {
        throw new Error(`unknown command ${command}`);
      }
      if (errors.length) break;
    }
    if (command === 'responsive' && !errors.length) {
      await win.loadURL(`${base}/?device=touch`);
      await new Promise((r) => setTimeout(r, 1000));
      const notice = await call(win, `({ notice: !!document.getElementById('device-notice'), canvas: !!document.querySelector('canvas') })`);
      if (!notice.notice || notice.canvas) fail(`touch-only device: notice ${notice.notice}, canvas ${notice.canvas} (want notice and no canvas)`);
      else log('touch-only device: shows the laptop/desktop notice and does not start the renderer — ok');
      report.results.push({ touchOnly: notice });
    }
  }
  report.errors = errors;
  await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  server.close();
  return errors.length === 0;
}

// a stalled GPU or a page that never answers must fail the run, not hang the session
setTimeout(() => { console.error(`[harness] FAIL: no result after ${TIMEOUT_MS / 60000} minutes`); app.exit(1); }, TIMEOUT_MS).unref();
app.whenReady().then(() => run()).then(
  (ok) => { log(ok ? 'PASS' : `FAIL (${errors.length} error${errors.length === 1 ? '' : 's'})`); app.exit(ok ? 0 : 1); },
  (e) => { console.error('[harness] FAIL', e.message); app.exit(1); },
);
