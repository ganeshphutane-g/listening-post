# CHANGELOG

- 2026-10-21 M0.1: Vite + strict TypeScript + three.js 0.186.1 + Rapier 0.21 + Vitest scaffold; pipeline-test scene ported to `src/main.ts`; `npm run verify` green (4 unit tests, JS 2.03 MB gzip); resize handling.
- 2026-10-21 M0.8: CLAUDE.md, HANDOFF.md, BACKLOG.md, DECISIONS.md (D-001…D-005), CHANGELOG.md, docs/ASSETS.md.
- 2026-10-21 M0.2: `tools/bootstrap.sh` installs apt packages (Mesa Vulkan, Xvfb, Electron libs), `npm ci`, checksum-checked Electron 45.0.0 into `.tools/`, and bpy 5.2.2 on Python 3.13 with `--blender`; prints all versions. Electron harness renders the corridor through WebGPU and WebGL2 in the cloud session.
- 2026-10-21 D-008: laptops and desktops only, every major browser, any window; new item M0.9 Responsive display; M0 gate, M0.6, M0.7 Mac-only. Development paused by the owner.
- 2026-10-22 M0.3: Electron harness (`shoot`, `tour`, `scenarios`, `bench`, `selftest`) with a test clock, render-target readback, pixelmatch diffs against per-platform baselines; `npm run verify` now runs it (13 s on the M1).
- 2026-10-22 M0.9: responsive display — resize, pixel ratio capped by tier budget, Hor+ field of view, interface scaling, Alt+Enter fullscreen, phone/tablet notice; harness `responsive` command checks 7 window sizes at 1× and 2× on both backends. Fixed WebGPU readback striping on widths that are not a multiple of 64 px.
- 2026-10-22 M0.4: lightmap ships as half-float KTX2 + Zstandard (1525 KB, identical frames to the EXR); `bootstrap.sh --ktx` installs ktx 4.4.2 with pinned checksums; lightmap debug view toured against baselines; UV flip removed.
- 2026-10-22 M0.5: `content/asset_manifest.json` v1 (12 materials, 4 HDRIs, Poly Haven CC0); `tools/fetch_assets.py` for the owner's computer (dry run: 40 files, 595 MB); ledger check in verify.
- 2026-10-22 M0.6: GitHub Pages preview built by Actions on every push to `main`: https://ganeshphutane-g.github.io/listening-post/ (owner check in Chrome and Safari pending).
