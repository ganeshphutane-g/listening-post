// Lightmap encoding (MASTER_PLAN §4.5 step 3, M0.4, D-011): denoised EXR bake → HDR KTX2 in
// R16G16B16A16_SFLOAT with Zstandard supercompression. three.js KTX2Loader uploads it as-is (no shader
// decode), 8 bytes per texel on the GPU. B10G11R11_UFLOAT would halve that, but ktx 4.4.2 writes corrupt
// texels for it (infinities and NaNs on a clean input), so it stays out until a fixed release.
// Fails if the result is over the 2 MB per 1024² budget.
//   node tools/pipeline/encode_lightmap.mjs <in.exr> <out.ktx2>
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('usage: encode_lightmap.mjs <in.exr> <out.ktx2>'); process.exit(2); }
const KTX_HOME = join(ROOT, '.tools/ktx');
const ktx = join(KTX_HOME, 'bin/ktx');
if (!existsSync(ktx)) { console.error(`no ktx at ${ktx}: run \`bash tools/bootstrap.sh --ktx\``); process.exit(1); }
const env = { ...process.env, DYLD_LIBRARY_PATH: join(KTX_HOME, 'lib'), LD_LIBRARY_PATH: join(KTX_HOME, 'lib') };
const r = spawnSync(ktx, ['create', '--format', 'R16G16B16A16_SFLOAT', '--assign-tf', 'linear', '--zstd', '22', input, output], { stdio: 'inherit', env });
if (r.status !== 0) process.exit(r.status ?? 1);

const BUDGET_PER_1024SQ = 2 * 1024 * 1024; // MASTER_PLAN §4.5: at most 2 MB per 1024² map
const info = spawnSync(ktx, ['info', '--format', 'json', output], { env, encoding: 'utf8' });
const header = JSON.parse(info.stdout).header;
const budget = BUDGET_PER_1024SQ * (header.pixelWidth * header.pixelHeight) / (1024 * 1024);
const bytes = statSync(output).size;
console.log(`lightmap: ${output} ${header.pixelWidth}x${header.pixelHeight} ${(bytes / 1024).toFixed(0)} KB (budget ${(budget / 1024).toFixed(0)} KB)`);
if (bytes > budget) { console.error('FAIL: lightmap over budget'); process.exit(1); }
