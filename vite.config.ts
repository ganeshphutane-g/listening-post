import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// build id shown in benchmark files: the CI commit, or the local checkout
const build = process.env.GITHUB_SHA?.slice(0, 7) ?? (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; } })();

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(build) },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
