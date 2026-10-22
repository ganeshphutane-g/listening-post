// Starts the Electron harness with the right wrapper for the platform:
// Linux cloud sessions need a virtual display (xvfb-run) and --no-sandbox on the command line,
// because Electron checks for root before run.mjs can add the switch itself.
//   node tools/harness/launch.mjs <command> [options]     (options: see run.mjs)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const electron = process.env.ELECTRON ?? resolve(ROOT, '.tools/bin/electron');
if (!existsSync(electron)) {
  console.error(`[harness] no Electron at ${electron}: run \`bash tools/bootstrap.sh\` first (or set ELECTRON)`);
  process.exit(1);
}
const args = [resolve(ROOT, 'tools/harness/run.mjs'), ...process.argv.slice(2)];
const [cmd, cmdArgs] = process.platform === 'linux'
  ? ['xvfb-run', ['-a', '-s', '-screen 0 1920x1080x24', electron, '--no-sandbox', ...args]]
  : [electron, args];
const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
process.exit(r.status ?? 1);
