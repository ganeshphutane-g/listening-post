// Collects benchmark and self-test results from any browser (M0.7): serves dist/ on localhost (a secure context, so WebGPU
// works) and saves every POST to /__bench as docs/bench/<date>_<browser>_<backend>.json. Open
// http://localhost:<port>/?bench=1&report=1 in the browser to measure; the page posts its result when done.
// http://localhost:<port>/?harness=1&report=1 runs every harness scenario in that browser and posts the outcome.
//   node tools/harness/bench_server.mjs [port] [count]   — exits after <count> results (default 2)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'dist');
const port = Number(process.argv[2] ?? 4321), want = Number(process.argv[3] ?? 2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.exr': 'image/x-exr', '.ktx2': 'image/ktx2', '.png': 'image/png' };
const browserOf = (ua) => {
  const m = /Edg\/(\d+)/.exec(ua) ?? /Firefox\/(\d+)/.exec(ua);
  if (m) return (ua.includes('Edg/') ? 'edge' : 'firefox') + m[1];
  const c = /Chrome\/(\d+)/.exec(ua); if (c) return `chrome${c[1]}`;
  const s = /Version\/(\d+)[.\d]* Safari/.exec(ua); if (s) return `safari${s[1]}`;
  return 'browser';
};
let got = 0;
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && (url.pathname === '/__bench' || url.pathname === '/__selftest')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    const r = JSON.parse(body);
    await mkdir(join(ROOT, 'docs/bench'), { recursive: true });
    const kind = url.pathname === '/__selftest' ? '_selftest' : '';
    const name = `${String(r.date).slice(0, 10)}_m1-air_${browserOf(r.userAgent)}_${String(r.backend).toLowerCase()}${kind}.json`;
    await writeFile(join(ROOT, 'docs/bench', name), JSON.stringify(r, null, 2) + '\n');
    console.log(kind ? `saved docs/bench/${name}: ${r.passed}/${r.total} scenarios passed, still brightness ${r.stillMeanBrightness}, errors ${r.errors.length}${r.results.filter((x) => !x.pass).map((x) => `\n  FAIL ${x.name}: ${x.detail}`).join('')}`
      : `saved docs/bench/${name}: ${r.avgFps} FPS avg, ${r.low1Fps} 1% low, p95 ${r.p95Ms} ms, valid=${r.valid} (${r.note})`);
    res.writeHead(204).end();
    if (++got >= want) setTimeout(() => process.exit(0), 200);
    return;
  }
  const file = join(DIST, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  let data;
  try { data = await readFile(file); } catch { res.writeHead(404).end(); return; } // read first: a missing favicon must not crash the server
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(data);
}).listen(port, '127.0.0.1', () => console.log(`bench server on http://localhost:${port}/ waiting for ${want} result(s)`));
