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

## 2026-10-22 D-012 First asset manifest: 12 Poly Haven materials and 4 HDRIs; ledger enforced in verify
- Context: M0.5 needs the route by which scanned materials reach the game (asset sites are blocked in build sessions, §2.2) and a check that keeps every shipped file ledgered.
- Decision: `content/asset_manifest.json` v1 lists 12 Poly Haven materials picked for a 1970s underground station (poured and worn concrete, painted concrete, damaged concrete for the flooded L3 rooms, peeling paint, rusty and bloc-green metal, floor plate, a metal shutter, linoleum, washroom tiles) at 2k (diffuse, OpenGL normal, AO-roughness-metal packed, PNG), and 4 artificially lit underground HDRIs at 2k EXR. Each entry carries a fixed ledger id (A-01xx materials, A-02xx HDRIs). `tools/fetch_assets.py` uses only the Python standard library, checks Poly Haven's MD5 for every file, skips complete files, writes a "Fetched sources" ledger section, and falls back to the macOS system roots when python.org's Python has no certificates (it never turns verification off). `tools/pipeline/check_assets.mjs` runs in `npm run verify`. Dry run: 40 files, 595 MB, all CC0, authors credited.
- Alternatives: ambientCG first (Poly Haven's API gives sizes and MD5s, and its assets are scanned); JPEG sources (smaller, but a second lossy step before KTX2); 4k (4× the size for surfaces seen at arm's length in the dark).
- Consequences: raw sources live only on the owner's computer (§8.9), so turning them into KTX2 (M4.3) runs there in an interactive session, or the processed files are committed from there. The credits screen must say "Powered by Poly Haven" (M6.5).
- Revisit when: M4.3 starts, or a needed surface is missing from Poly Haven.

## 2026-10-22 D-013 Previews on GitHub Pages, built by GitHub Actions
- Context: MASTER_PLAN §7 and M0.6 said to try a private Claude artifact page first, with Cloudflare Pages as the fallback. The owner then made the repository public "so GitHub Pages can host previews" (2026-10-21).
- Decision: `.github/workflows/pages.yml` builds every push to `main` (type check, unit tests, build, bundle and asset checks; the GPU harness stays in sessions) and deploys `dist/` to https://ganeshphutane-g.github.io/listening-post/. Pages is enabled with the Actions source.
- Alternatives: Claude artifact page (WebGPU and WASM untested inside it, file limits, private by default — not needed for a public repo); Cloudflare Pages (needs the owner's account).
- Consequences: every push to `main` is public within minutes, so `main` must stay green and nothing unreleasable may be committed. Actions minutes are free for public repositories. M0.6 is accepted when the owner opens the preview in Chrome and Safari on the Mac.
- Revisit when: previews must become private, or the site nears GitHub Pages' 1 GB / 100 GB-a-month limits.

## 2026-10-22 D-014 Input: physical key codes, swap-on-conflict rebinding, pause whenever the pointer is released
- Context: M1.1 needs rebindable keys, gamepad, raw mouse and saved settings that work in Chrome, Edge, Firefox and Safari on Mac and Windows laptops.
- Decision: bindings use `KeyboardEvent.code` (physical position), so WASD stays under the left hand on AZERTY and QWERTZ layouts; two slots per action; rebinding a key already in use swaps it with the old one, so nothing is bound twice or lost; Escape is reserved (the browser uses it to release pointer lock). Pointer lock asks for raw, unaccelerated movement and retries without the option where Safari or Firefox refuse it. Losing the pointer for any reason (Esc, alt-tab, hidden tab) pauses and shows a "Click to play" overlay, because browsers only re-lock after a click. The standard-mapping gamepad follows §3.8; its Menu button toggles pause. Settings live in local storage under a versioned key, merged field by field with defaults, and survive blocked storage (private windows) by falling back to defaults.
- Alternatives: `KeyboardEvent.key` (letters move with the layout); refusing a conflicting rebind (players hate dead ends); pausing only on Esc (alt-tab would leave the game running blind).
- Consequences: prompts must name keys by the player's layout (M1.6: `navigator.keyboard.getLayoutMap()` where available, the code name elsewhere). Real pointer lock needs a user gesture, so the scenario drives the same handler the browser event calls; the owner checks the real lock in Chrome and Safari.
- Revisit when: playtest 1 (M1.7) reports control problems.

## 2026-10-22 D-015 Character controller: Rapier kinematic capsule with our own stair stepping; fixed 60 Hz loop
- Context: M1.2 needs walking, sprint with stamina, crouch, lean, stairs and slopes, with scenarios for step height, slope limit and a 1.2 m beam.
- Decision: a parentless capsule collider moved by Rapier's `KinematicCharacterController` (slope limit 45°, ground snap 0.3 m, pushes dynamic bodies). Rapier's autostep never engaged on a plain box step in tests (also with a smaller minimum width and with dynamic bodies included), so `tryStep()` lifts the capsule by the step height when the ground move is blocked, retries the move, looks for a landing a radius ahead (one frame's move leaves the rounded bottom short of the edge), and keeps the step only if it lands on walkable ground (ray normal within the slope limit) no higher than the step height. Crouch shrinks the capsule at once and refuses to stand up while a standing capsule would overlap something. Lean offsets and rolls the camera, cut short by a ray toward the wall. Head-bob follows stride phase and has a settings switch; a footstep event fires each stride (for M1.5). The game loop now simulates at a fixed 60 Hz with at most 5 catch-up steps and renders every animation frame (§4.3). All numbers are in `content/player.json`.
- Alternatives: rely on Rapier autostep (did not work); a ray-cast "floating" controller (more code, worse with dynamic props); variable-step simulation (non-deterministic, breaks scenarios).
- Consequences: scenarios pass on both backends: 0.30 m step climbed, 0.45 m blocked; 30° ramp climbed, 55° blocked; standing blocked by a 1.2 m beam, crouching passes and stays crouched beneath it; corridor walk from spawn. Revisit the step code if Rapier's autostep is fixed upstream.
- Revisit when: playtest 1 (M1.7) reports movement feel problems, or a Rapier upgrade.

## 2026-10-22 D-016 Flashlight beam pattern as an IES profile, not a projected cookie map
- Context: M1.3 asks for a cookie texture so the beam has a real reflector pattern, visible in the tour. three.js r186 projects `SpotLight.map` through the shadow camera and, with a map set, the light outside that square frustum went dark: the tour showed a hard-edged square around the beam and nearby props lost the torch's spill (seen on both backends; widening the frustum with `shadow.focus` only moved the square).
- Decision: the torch is an `IESSpotLight` whose `iesMap` is a generated 512×1 profile (brightness by angle from the axis): hot centre, darker ring, bright outer ring, soft halo, a soft cut at the rim (`reflectorProfile()` in `src/player/flashlight.ts`). No projection frustum, so no square and no clipped spill; no asset file. The beam trails the camera (slerp at 16/s), the battery drains over 900 s of on-time and below 15% the beam fades and flickers with dips that deepen as it empties. A tour stop (`torch-wall`) shows the pattern on a wall. Tuning: `content/flashlight.json`.
- Alternatives: a cookie map with the frustum widened (the square stays); a TSL `colorNode` (same frustum select); no pattern (a flat disc reads as a game light, not a torch).
- Consequences: the beam pattern is radial only (no smudges across it); fine for a reflector. Tour, lightmap-view and responsive baselines were regenerated for the new beam on 2026-10-22.
- Revisit when: a non-radial pattern (cracked lens, filament shadow) is wanted, or three.js changes how spot maps are clipped.

## 2026-10-22 D-017 Interaction: hand point along the view; joint motors drag doors and drawers; spring-carried props
- Context: M1.4 needs a focus ray, carrying, inspecting, dragging, throwing by hold time, hinged doors dragged by hand, and drawers that stop at their limits.
- Decision: the "hand" is a point a fixed distance along the view (the grab distance for doors and drawers, 1.1 m for carried props). Doors are dynamic bodies on revolute joints (0–110°) and drawers on prismatic joints (0–travel); while held, the joint's position motor chases the hand's angle or slide position, and on release only a friction motor remains, so joint limits always hold. Props follow the hand on a velocity spring capped at 6 m/s; anything over 20 kg is dragged along the floor at a stiffness scaled by its mass. Throw speed rises with hold time (0.8 s to full) from 2.5 to 9 m/s and falls with the square root of mass. The corridor's ~25 kg crates are props, so they drag. A prompt names the action under the crosshair. Inspect-and-rotate is left to M1.7's Feel Lab, where inspectable objects exist.
- Alternatives: a fixed joint to a kinematic hand (rigid, lets the player shove anything with infinite force); mouse-delta torque on doors (Amnesia-style; worth trying after playtest 1).
- Consequences: scenarios pass on both backends: a door walked open reaches 80° and stops at 110°; a full throw of 1 kg lands 4.77 m away (tuned range 3.5–7.5 m); a drawer stops at 0.400 m out and 0.000 m in. To push a door open the player walks with it or turns.
- Revisit when: playtest 1 (M1.7) says doors feel wrong.

## 2026-10-22 D-018 Sound events: surface tags on colliders, a dB loudness table, weight-scaled impact thresholds
- Context: M1.5 needs surface detection, sound selection and `SoundEvent` loudness before any sound files exist (they arrive with the Sonniss/Freesound downloads, M5), because the creature's hearing (M3) runs on these events.
- Decision: a typed `EventBus` (`src/core/events.ts`) carries `SoundEvent`s (kind, position, dB at 1 m, surface, sound id, source, time). Colliders carry surface tags; footsteps ray down from the feet. Footstep loudness = gait level (crouch 42, walk 54, sprint 63 dB) + surface offset (metal +6, wet concrete +3, linoleum −3, …); impact loudness = 52 dB at 5 N·s, +6 dB per doubling of impulse, + the louder surface of the pair, clamped to 28–100 dB. Impacts come from Rapier contact-force events; each body's threshold is 2.5× its weight, because a resting body presses its weight into the floor every step (a resting 25 kg crate emitted 38 "impacts" before this), plus a 0.1 s cooldown per pair. Sound ids pick one of 4 variants without immediate repeats (seeded). `?debug=1` shows the last 10 events. All numbers in `content/sound.json`.
- Alternatives: loudness from relative velocity only (ignores mass, so a can and a crate dropped together sound alike); a fixed force threshold (spams on heavy resting bodies or misses light impacts).
- Consequences: scenario `sound-events`: 4 footsteps on wet concrete at 57 dB while walking 2 s; one crate drop gives one 86 dB impact. The game loop now steps physics with the event queue.
- Revisit when: M3.1 propagation is tuned against playtests, or the audio assets show the variant count is wrong.

## 2026-10-22 D-019 Menus: DOM overlays; only Play and Resume take the pointer; settings apply live
- Context: M1.6 needs a title screen that grants pointer lock and audio, a pause menu, settings, loading progress and quality tier selection, readable on every laptop size (D-008).
- Decision: menus are plain DOM over the canvas (`src/ui/menus.ts`), sized from the window height. Play and Resume are the only places that request pointer lock and resume the shared `AudioContext` (both need a user gesture); a click on the canvas no longer grabs the pointer. Losing the pointer while playing opens the pause menu (Resume, Settings, Quit to title). Settings cover mouse sensitivity, field of view (55–100°, vertical at 16:9), invert look, head-bob, hold or toggle crouch, quality (Automatic = Medium until M4.7 detects hardware) and click-to-rebind keys (Escape cancels and can never be bound); every change is saved and applied at once (input, controller, display tier and field of view). Loading progress comes from three.js's default loading manager.
- Alternatives: a UI framework (weight and build complexity for a handful of screens); canvas-drawn menus (worse text, no accessibility).
- Consequences: scenario `menus` walks title → settings → back → play → pause → settings → back → resume → pause → quit, changing sensitivity, invert and a binding; the harness reloads and finds all three persisted. Looking at the screen found the throw default bound to the middle button (`Mouse1`); it is now the right button (`Mouse2`), with a unit test.
- Revisit when: M6.1 accessibility work (subtitle options, colour-safe interface) or a gamepad-navigable menu is needed.
