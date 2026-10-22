# DECISIONS

Format: MASTER_PLAN §8.6. Newest at the bottom.

## 2026-10-21 D-001 Engine: three.js
- Context: needed a browser engine that runs headless in build sessions and reaches realistic lighting.
- Decision: three.js 0.186.1 `WebGPURenderer` with automatic WebGL2 fallback, TSL post-processing.
- Alternatives: Babylon.js (strong, more built in; fallback if three.js blocks a feature); PlayCanvas (cloud editor, poor fit for headless sessions); Godot web (WebGL2 only, no volumetrics).
- Consequences: rendering code is TSL; every feature needs a WebGL2 path.
- Revisit when: three.js blocks a feature listed in MASTER_PLAN §5.

## 2026-10-21 D-002 Verify has no linter yet
- Context: MASTER_PLAN §8.8 says "type check and lint", but §4.1 pins no linter.
- Decision: `npm run verify` = `tsc --noEmit` (strict) + Vitest + `vite build` + JS gzip budget check. No linter until one is pinned.
- Alternatives: add ESLint now (an unpinned tool, and more config to keep green).
- Consequences: style is not enforced mechanically.
- Revisit when: a second contributor or repeated style churn appears.

## 2026-10-21 D-003 Generated assets are committed; raw bakes are not
- Context: the corridor bake takes about 30 s on an M1 and about 75 s on 2 cloud cores; every run re-baking wastes budget.
- Decision: commit the game-ready outputs of `tools/blender/*` in `public/assets/` (each ledgered). The un-denoised bake goes to `assets_src/` (git-ignored) via the bake script's new `raw_dir` argument.
- Alternatives: bake in every run (slow); commit raw bakes too (12.6 MB per bake, never shipped).
- Consequences: regenerate and commit whenever a Blender script changes.
- Revisit when: M0.4 replaces the EXR lightmap with KTX2.

## 2026-10-21 D-004 Electron is not an npm dependency
- Context: the starter listed `electron` in package.json; MASTER_PLAN M0.2 installs Electron from the GitHub release with a checksum check.
- Decision: drop `electron` from package.json; `tools/harness/shoot.cjs` stays and is run with an Electron binary installed by bootstrap (M0.2). M0.1 checks used a throwaway `electron@45.0.0` install outside the repo.
- Alternatives: keep it in devDependencies (heavy `npm ci` in every run, postinstall download not checksum-pinned).
- Consequences: `npm ci` stays small; the harness needs M0.2's bootstrap.
- Revisit when: M0.2 lands.

## 2026-10-21 D-005 Resize handling and zero-size guard
- Context: on a real GPU (Apple M1, Metal) the page loaded inside a hidden 0×0 view, and a zero-size swapchain texture invalidated every WebGPU pass after it ("Could not create a swapchain texture of size 0"). The CPU-adapter test never hit this.
- Decision: clamp the renderer size to at least 1×1 and handle `resize` (renderer size and camera aspect).
- Alternatives: none reasonable; MASTER_PLAN §4.10 already asks for robust browser behaviour.
- Consequences: the scene survives hidden tabs, collapsed panes and window resizes.
- Revisit when: device-loss handling lands (§4.10).

## 2026-10-21 D-006 Bootstrap pins Electron checksums in the script; Blender is opt-in
- Context: M0.2 installs Electron from the GitHub release "with checksum check". Checking against the release's own SHASUMS256.txt would trust the same source as the download. MASTER_PLAN §0 says to install export and bake tools only on runs that need them.
- Decision: `tools/bootstrap.sh` carries the SHA-256 of `electron-v45.0.0-{linux-x64,darwin-arm64,darwin-x64}.zip` (copied from the release's SHASUMS256.txt on 2026-10-21) and fails on mismatch. Electron unpacks into `.tools/` (git-ignored), linked at `.tools/bin/electron`. `bpy` installs only with `--blender`; `--no-apt` skips system packages. Written for bash 3.2 so it also runs on the owner's Mac.
- Alternatives: download SHASUMS256.txt at run time (no protection against a swapped release); always install bpy (≈30 s and several hundred MB per run for nothing).
- Consequences: bumping Electron means updating three hashes in the script; runs that bake must pass `--blender`.
- Revisit when: Electron is upgraded, or a Windows bootstrap is needed.

## 2026-10-21 D-007 bpy 5.2.2 needs Python 3.13
- Context: PyPI has `bpy==5.2.2` wheels for CPython 3.13 only; the cloud image's default `python3` is 3.11, so `python3 -m venv .venv && pip install bpy==5.2.2` fails.
- Decision: bootstrap builds `.venv` with `python3.13` (present in the cloud image) and recreates a `.venv` made with another Python.
- Alternatives: drop to bpy 5.0.1 (last cp311 wheel; breaks the §4.1 pin and the M0.1 assets' provenance).
- Consequences: the owner's Mac also needs `python3.13` on PATH for `--blender`.
- Revisit when: bpy is upgraded.

## 2026-10-21 D-008 Laptops and desktops only, every major browser, any window
- Context: the owner wants the game to work in every major browser on Mac and Windows laptops, and not on phones or tablets. The owner has no Windows PC.
- Decision: target Chrome, Edge, Firefox and Safari on macOS and Windows laptops and desktops. The game adapts to any window size, aspect ratio, pixel ratio, zoom level and fullscreen (rules in MASTER_PLAN §4.10). Touch-only phones and tablets get a "laptop or desktop browser needed" notice. New backlog item M0.9 builds it, after the harness (M0.3) so the tour can check several viewport sizes.
- Alternatives: phone and tablet support (touch controls, much tighter GPU and memory budgets; the realism goals in §1 do not survive it); a fixed 16:9 canvas with black bars (wastes laptop screens of other shapes).
- Consequences: Windows is tested without the owner's hardware: Chromium in the Electron harness covers Chrome and Edge rendering; Windows-only differences (Direct3D 12 WebGPU, Firefox on Windows) wait for outside testers at M6.3. The M0 gate, M0.6 and M0.7 now ask for the Mac in Chrome and Safari only.
- Revisit when: the owner asks for mobile, or a Windows tester joins.

## 2026-10-22 D-009 Harness design: test clock, frames driven by the runner, baselines per platform
- Context: M0.3 needs tours and scenarios that render the same frame every run, through both backends, on the owner's Mac (Metal) and in cloud sessions (software Vulkan/SwiftShader). Film grain and fog drift read TSL `time`, which three.js takes from `performance.now()`.
- Decision: `?harness=1` swaps in a fake `performance.now()` (`src/debug/clock.ts`) and exposes `window.__harness` (`still`, `scenario`, `bench`). The runner (`tools/harness/run.mjs`, Electron, ESM) serves `dist/` itself, opens a hidden window, drives frames by calling the page (no requestAnimationFrame), reads stills from a render target, and fails on any console error, GPU validation error, lost device or crashed renderer. Diffs use pixelmatch 8.0.0 (threshold 0.1, fail above 0.2% of pixels) on bitmaps decoded by Electron's `nativeImage`, so no PNG library is added. Baselines are stored per `<platform>-<mode>/<backend>` because Metal and software renderers never match pixel for pixel. A missing baseline is written and the run passes. `shoot.cjs` is replaced.
- Alternatives: rAF-driven `?shot=1` (stalls in hidden windows and tabs); diffing with a loose threshold instead of a fixed clock (hides real regressions); one shared baseline set (fails on every platform but one).
- Consequences: the Mac tour matches its baselines at 0.000%; a swapped baseline fails at 40% and writes a diff image. The first cloud run creates `linux-vulkan` baselines and must commit them. `bench` numbers from the hidden window are CPU encode time only; the real benchmark is M0.7.
- Revisit when: temporal effects (TRAA, motion blur) need several warm-up frames, or baselines churn on driver updates.

## 2026-10-22 D-010 Field of view is Hor+ between 4:3 and 21:9; render buffer capped per tier
- Context: D-008's text said the camera keeps a horizontal field of view "so wider screens see more", which contradicts itself: a fixed horizontal view makes wide screens see less vertically. M0.9 also needed a rule for Retina and large windows, which can ask for far more pixels than the GPU should shade.
- Decision: keep the vertical field of view fixed (72° by default, `content/display.json`), so a 16:10 Mac sees slightly less to the sides than 16:9 and a 21:9 monitor sees more. Below 4:3 the 4:3 horizontal view is held (no keyhole in tall windows); above 21:9 the 21:9 horizontal view is held (no fisheye on super-ultrawides). The render buffer uses min(device ratio, 2) × render scale, lowered until it fits the tier's pixel budget (Medium: 1920×1080 pixels), never below 0.5. Interface text scales with window height in CSS. Alt+Enter toggles fullscreen. Touch-only devices get a notice and the renderer never starts.
- Alternatives: fixed horizontal view (Vert−, crops wide screens); unlimited pixel ratio (a 1440×900 Retina laptop would shade 5.2 MP per frame on an 8 GB M1).
- Consequences: a 3440×1440 window on Medium renders 2225×931 and is upscaled; the M1 Air at 1440×900 Retina renders 1821×1138. Tier choice comes in M1.6, the field-of-view setting in M1.1/M1.6.
- Revisit when: the owner's benchmark (M0.7) or playtests say the default field of view or budgets are wrong.

## 2026-10-22 D-011 Lightmaps ship as half-float KTX2 with Zstandard; RGBM not needed
- Context: MASTER_PLAN §4.5 asked M0.4 to choose by test between RGBM 8-bit KTX2 and HDR KTX2, within 2 MB per 1024² map and with no visible banding. The M0.1 lightmap shipped as a 1.47 MB 16-bit EXR decoded in JavaScript.
- Decision: `R16G16B16A16_SFLOAT` KTX2 with Zstandard level 22 (`tools/pipeline/encode_lightmap.mjs`, ktx 4.4.2 pinned in `tools/bootstrap.sh --ktx`): 1525 KB for the 1024² corridor map, loaded by three.js KTX2Loader with no shader decode, filtering set to linear (the loader leaves raw formats on nearest). The bake's EXRs move to `assets_src/` (git-ignored). The lightmap UV V-flip is gone: KTX2 rows are top-down like glTF UVs; the old EXR loader returned them bottom-up.
- Test: the tour with the KTX2 map matches the EXR-based baselines at 0.000% on all five stops through both backends, so there is no banding or precision loss; the lightmap debug view now has its own baselines. `B10G11R11_UFLOAT` (0.83 MB, half the GPU memory) was tried first and rejected: ktx 4.4.2 writes infinities and NaNs for a clean input (seen in ktx's own round trip and in the browser), which turned every frame black through bloom. RGBM was not built: HDR already meets the budget with no decode cost and no block artifacts.
- Alternatives: keep EXR (decoder cost on load, not a GPU format); RGBM in UASTC (smaller on the GPU, but a shader decode and block error in dark gradients); B10G11R11 (broken in the current tool).
- Consequences: 8 MB of GPU memory per 1024² lightmap; a 15-map slice costs ~120 MB. Re-encoding needs `bootstrap.sh --ktx`. Vite's JS grew 40 KB gzip for the Zstandard decoder.
- Revisit when: a ktx release fixes B10G11R11 (halves lightmap memory), or the M4.10 performance pass finds texture memory tight on the 8 GB M1.
