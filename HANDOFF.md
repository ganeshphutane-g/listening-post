# HANDOFF — 2026-10-21 19:59 IST — run 1 (interactive, on the owner's Mac)

## State
- Milestone: M0 Pipeline — 2/8 items (M0.1, M0.8)
- Build: green — npm run verify: tsc strict OK; 4/4 unit tests; vite build OK; JS 2.03 MB gzip (limit 2.50 MB)
- Preview: none (local only: `npm run dev`)
- Repository: https://github.com/ganeshphutane-g/listening-post (public, branch `main`). Public, so GitHub Pages is available for previews (M0.6).

## This run
- Item: M0.1 Scaffold — DONE; M0.8 Memory files — DONE (needed to record this run)
- Changes:
  - Vite 8.3.5 + TypeScript 5.9.3 (strict) + three.js 0.186.1 + Rapier 0.21.0 + Vitest 5.0.5, exact pins; scripts `dev`, `build`, `verify`
  - Starter moved into the §4.2 layout: `src/main.ts`, `tools/blender/`, `tools/harness/shoot.cjs`
  - Pure helpers split out with unit tests: `src/render/lightmap.ts` (V flip), `src/render/readback.ts` (row order + WebGPU row padding)
  - Resize handling and a 1×1 minimum size (D-005): a 0×0 load broke every WebGPU pass on the M1
  - Assets regenerated with bpy 5.2.2 on the M1 and committed (D-003): bake 22 s + denoise 5 s; denoised lightmap is 1.47 MB (16-bit EXR), not 12.6 MB
- Evidence (Apple M1 MacBook Air, macOS 26.5.1, Metal):
  - Electron 45 harness, `?shot=1`: WebGPU (adapter apple / metal-3) cratesResting=true, CPU 2.3 ms/frame; WebGL2 cratesResting=true, CPU 1.9 ms/frame
  - Screenshots: `docs/screenshots/m0.1_m1-air_webgpu.png`, `docs/screenshots/m0.1_m1-air_webgl2.png` — the two backends match
  - Live dev server: ~60 FPS at 678×631 on WebGPU (vsync-capped); lightmap debug view correct (lamp pool mid-corridor, red glow at far end)

## Next
- M0.2 Bootstrap — first unblocked item. It targets the Linux cloud session (apt, Xvfb, Mesa Vulkan); write it there, not on the Mac.

## Known issues
- `tools/harness/shoot.cjs` modes are Linux-oriented; on macOS pass any mode other than `webgpu-vulkan`/`webgpu-swiftshader` to use the native Metal adapter. M0.3 should add a proper `native` mode.
- Browser pane / hidden tabs pause requestAnimationFrame, so `?shot=1` stalls in a hidden tab. Use the Electron harness (backgroundThrottling off).
- Vite warns that the main chunk is over 4000 kB raw (the HDRI is inlined as base64). Within budget; revisit in M0.4/M6.2.
- Visual baselines are not stored yet (M0.3). The M1 screenshots are reference images, not baselines: Metal and SwiftShader frames will differ.

## Questions for you
- Connect GitHub to Claude with access to `ganeshphutane-g/listening-post` so scheduled runs can clone and push (MASTER_PLAN §11), then approve the scheduled task (§8.2 prompt, with `<OWNER>/<REPO>` = `ganeshphutane-g/listening-post`).
- Your Claude plan (Pro or Max), your Windows PC's GPU, and which browsers you use there. This Mac: MacBook Air M1, 8 GB, macOS 26.5.1, Chrome + Safari. That's the plan's Medium tier.

## Usage note
- Run size (self-estimate): medium
- Owner's weekly usage reading after this run: <filled by owner>
