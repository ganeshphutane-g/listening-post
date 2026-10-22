// Electron harness (MASTER_PLAN §8.8, M0.3). Serves dist/, opens the game with ?harness=1 and drives it
// through window.__harness. Any page error, GPU validation error or lost device fails the run.
//
//   electron tools/harness/run.mjs <command> [options]      (normally via `node tools/harness/launch.mjs`)
//   commands: shoot [stop]   one still per backend → tests/visual/out/shoot/
//             tour           every stop in tests/visual/tour.json, diffed against baselines
//             scenarios      every page-side scenario (physics checks)
//             bench          CPU frame time, draw calls, triangles (budgets come with M0.7 and §4.11)
//             selftest       loads a page that throws; passes only if the error is caught
//   options:  --backend webgpu|webgl|both (default both)   --size 960x540   --dpr 1
//             --mode native|vulkan|swiftshader (default: native on macOS, vulkan on Linux)
//             --update   write current tour frames as the new baselines
import { app, BrowserWindow, nativeImage } from 'electron';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(process.argv.findIndex((a) => a.endsWith('run.mjs')) + 1);
const VALUED = new Set(['--backend', '--size', '--dpr', '--mode']);
const positionals = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes(`--${name}`);
const [command = 'tour', positional] = positionals;
const BACKENDS = { both: ['webgpu', 'webgl'], webgpu: ['webgpu'], webgl: ['webgl'] }[opt('backend', 'both')];
const [W, H] = opt('size', '960x540').split('x').map(Number);
const DPR = Number(opt('dpr', '1'));
const MODE = opt('mode', process.platform === 'linux' ? 'vulkan' : 'native');
const PLATFORM = `${process.platform}-${MODE}`;
const MAX_DIFF = 0.002; // fraction of pixels allowed to differ from a baseline
const OUT = join(ROOT, 'tests/visual/out', command);
const BASELINES = join(ROOT, 'tests/visual/baselines', PLATFORM);
const TIMEOUT_MS = 10 * 60 * 1000;

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
    await writeFile(join(OUT, `${backend}-${name}.diff.png`), nativeImage.createFromBitmap(out, sa).toPNG());
    fail(`${backend}/${name}: ${(frac * 100).toFixed(2)}% of pixels differ from the baseline (limit ${MAX_DIFF * 100}%)`);
  }
  log(`${backend}/${name}: ${(frac * 100).toFixed(3)}% differ`);
  return { name, backend, diff: +frac.toFixed(5) };
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const dist = join(ROOT, 'dist');
  if (!(await exists(join(dist, 'index.html')))) throw new Error('dist/ is missing: run `npm run build` first');
  const server = await serve(dist);
  const base = `http://127.0.0.1:${server.address().port}`;
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false,
    webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => {
    const { level, message } = e;
    if (level === 'error' || /GPU_ERROR|DEVICE_LOST/.test(message)) fail(`page: ${message.slice(0, 400)}`);
    else if (flag('verbose')) log('page:', message.slice(0, 300));
  });
  win.webContents.on('render-process-gone', (_e, d) => fail(`renderer process gone: ${d.reason}`));
  win.webContents.on('did-fail-load', (_e, code, desc) => fail(`load failed: ${code} ${desc}`));
  const probe = await (async () => { await win.loadURL(`${base}/`); return call(win, `(async()=>{ if(!navigator.gpu) return 'navigator.gpu missing'; const a = await navigator.gpu.requestAdapter(); if(!a) return 'no adapter'; const i = a.info || {}; return [i.vendor, i.architecture, i.description].filter(Boolean).join(' / ') || 'adapter'; })()`); })();
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
  } else {
    const tour = JSON.parse(await readFile(join(ROOT, 'tests/visual/tour.json'), 'utf8')).stops;
    for (const backend of BACKENDS) {
      await openGame(win, base, backend);
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
          report.results.push({ ...(await compare(stop.name, backend, buf)), seconds: (Date.now() - t0) / 1000 });
        }
      } else if (command === 'scenarios') {
        for (const name of await call(win, 'window.__harness.scenarios()')) {
          const r = await call(win, `window.__harness.scenario(${JSON.stringify(name)})`);
          (r.pass ? log : fail)(`${backend}/${name}: ${r.pass ? 'PASS' : 'FAIL'} ${r.detail}`);
          report.results.push({ backend, ...r });
        }
      } else if (command === 'bench') {
        const r = await call(win, 'window.__harness.bench()');
        log(`${backend}: ${JSON.stringify(r)}`);
        report.results.push(r);
      } else {
        throw new Error(`unknown command ${command}`);
      }
      if (errors.length) break;
    }
  }
  report.errors = errors;
  await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  server.close();
  return errors.length === 0;
}

app.whenReady().then(() => run()).then(
  (ok) => { log(ok ? 'PASS' : `FAIL (${errors.length} error${errors.length === 1 ? '' : 's'})`); app.exit(ok ? 0 : 1); },
  (e) => { console.error('[harness] FAIL', e.message); app.exit(1); },
);
