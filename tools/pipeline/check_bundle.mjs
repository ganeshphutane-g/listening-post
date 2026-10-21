// M0.1 acceptance: shipped JavaScript stays under the gzip budget. Run after `vite build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT_GZIP = 2.5 * 1024 * 1024; // MASTER_PLAN §9 M0.1
const dir = 'dist';
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (p.endsWith('.js')) files.push(p);
});
walk(dir);
let raw = 0, gz = 0;
for (const f of files) {
  const buf = readFileSync(f);
  raw += buf.length;
  gz += gzipSync(buf, { level: 9 }).length;
}
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log(`bundle: ${files.length} JS files, ${mb(raw)} raw, ${mb(gz)} gzip (limit ${mb(LIMIT_GZIP)})`);
if (files.length === 0 || gz > LIMIT_GZIP) {
  console.error(files.length === 0 ? 'no JS found in dist/ — run vite build first' : 'FAIL: JavaScript over gzip budget');
  process.exit(1);
}
