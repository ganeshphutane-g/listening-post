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
