// Asset ledger check (MASTER_PLAN §0 "never add an asset without a ledger entry", §4.5 step 6, §8.8 step 6).
// Fails when a file under public/assets/ has no row in docs/ASSETS.md, a row names a licence that is not
// allowed (CC0, CC-BY, MIT, Apache-2.0, explicitly royalty-free, or ours; never NC), a file is over the
// 25 MiB host limit (§4.11), or a manifest asset in content/asset_manifest.json has no ledger id.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ALLOWED = /^(CC0(-1\.0)?|CC-BY(-\d\.\d)?|MIT|Apache-2\.0|royalty-free|ours)$/i;
const MAX_FILE = 25 * 1024 * 1024;
const problems = [];

const rows = readFileSync('docs/ASSETS.md', 'utf8').split('\n')
  .filter((l) => /^\| A-\d{4} \|/.test(l))
  .map((l) => {
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    return { id: cells[0], files: [...cells[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]), licence: cells[4] };
  });
for (const r of rows) {
  if (!ALLOWED.test(r.licence)) problems.push(`${r.id}: licence "${r.licence}" is not allowed`);
  if (/NC/.test(r.licence)) problems.push(`${r.id}: non-commercial licence`);
}
const ids = rows.map((r) => r.id);
for (const dup of ids.filter((id, i) => ids.indexOf(id) !== i)) problems.push(`${dup}: duplicate ledger id`);

// a ledger path covers a file exactly, as a directory prefix ending in /*, or by a * glob
const covers = (pattern, file) => {
  if (pattern === file) return true;
  const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
  return re.test(file);
};
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk('public/assets');
for (const f of files) {
  const rel = relative('.', f).split('\\').join('/');
  if (rel.endsWith('.DS_Store')) continue;
  if (!rows.some((r) => r.files.some((p) => covers(p, rel)))) problems.push(`${rel}: no ledger row in docs/ASSETS.md`);
  if (statSync(f).size > MAX_FILE) problems.push(`${rel}: ${(statSync(f).size / 1048576).toFixed(1)} MiB is over the 25 MiB file limit`);
}

const manifest = JSON.parse(readFileSync('content/asset_manifest.json', 'utf8'));
for (const e of [...manifest.materials, ...manifest.hdris]) {
  if (!/^A-\d{4}$/.test(e.ledger ?? '')) problems.push(`manifest ${e.id}: missing ledger id`);
}

console.log(`assets: ${files.length} shipped files, ${rows.length} ledger rows, ${manifest.materials.length + manifest.hdris.length} manifest entries`);
for (const p of problems) console.error(`FAIL ${p}`);
process.exit(problems.length ? 1 : 0);
