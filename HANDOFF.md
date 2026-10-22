# HANDOFF — 2026-10-22 14:15 IST — run 3 (interactive, owner's Mac, 2-hour build session)

> **PAUSED for scheduled runs (owner, 2026-10-21).** The routine "Listening Post daily build" stays disabled. On 2026-10-22 the owner asked for a 2-hour interactive build session; scheduled runs resume only when the owner says so (then re-enable it at https://claude.ai/code/routines/trig_01GDfwsaPBiuagjXtDGfS8EA and delete this line). If a scheduled run starts anyway, change nothing and stop.

## State
- Milestone: M0 Pipeline — 7/9 items done (M0.1, M0.2, M0.3, M0.4, M0.5, M0.8, M0.9); M0.6 and M0.7 are built and wait for the owner's check
- Build: green — npm run verify (45 s on the M1): tsc strict; 29/29 unit tests; scenarios incl. pause-on-pointer-release and 4 controller scenarios; build; JS 2.07 MB gzip (limit 2.50); asset ledger; harness self-test; scenarios; tour (6 stops) + lightmap-view tour (0.000% vs baselines, regenerated for the new beam); responsive at 7 sizes, 1× and 2×; benchmark page on both backends
- Preview: https://ganeshphutane-g.github.io/listening-post/ (GitHub Pages, rebuilt on every push to `main`, D-013)
- Repository: https://github.com/ganeshphutane-g/listening-post (public, branch `main`)

## This run
- Items: M1.3 Flashlight — DONE; M1.2 Character controller — DONE; M1.1 Input — DONE (started before the M0 gate closed, because the owner asked for a 2-hour build; M0.6/M0.7 only wait for the owner's browser check); M0.3 Harness — DONE; M0.9 Responsive display — DONE (done before M0.4 at the owner's priority); M0.4 Lightmap pipeline — DONE; M0.5 Asset routes — DONE; M0.6 Preview channel — BUILT, owner check pending; M0.7 Benchmark — BUILT, owner results pending
- Changes:
  - Harness (`tools/harness/run.mjs`, D-009): test clock makes frames identical run to run; commands `shoot`, `tour`, `scenarios`, `bench`, `benchpage`, `responsive`, `selftest`; fails on any page or GPU error; 10-minute watchdog; baselines per platform in `tests/visual/baselines/<platform>-<mode>/`
  - Responsive display (`src/render/display.ts`, D-008, D-010): pixel ratio capped by the tier's pixel budget, Hor+ field of view between 4:3 and 21:9, interface text scales with height, Alt+Enter fullscreen, phone/tablet notice
  - Lightmap (D-011): half-float KTX2 + Zstandard, 1525 KB; identical frames to the EXR; `bootstrap.sh --ktx`; UV flip removed (KTX2 rows are top-down)
  - Assets (D-012): `content/asset_manifest.json` (12 materials, 4 HDRIs, CC0), `tools/fetch_assets.py` for the owner's computer, ledger check in verify
  - Preview (D-013): `.github/workflows/pages.yml` builds and deploys every push to `main`
  - Input (D-014): rebindable actions with swap on conflict, raw-mouse pointer lock, gamepad (§3.8), settings in local storage, pause overlay whenever the pointer is released; the preview now has mouse look and F toggles the flashlight
  - Character controller (D-015): Rapier kinematic capsule with our own stair stepping (Rapier's autostep never engaged), sprint stamina, crouch, lean, head-bob switch, footstep events; fixed 60 Hz loop; tuning in `content/player.json`; the preview is walkable
  - Flashlight (D-016): reflector beam pattern as an IES profile (a projected cookie map clipped the light to a square), lag behind the camera, 900 s battery, fade and flicker when low; tour stop `torch-wall`
  - Benchmark: `?bench=1` flies a 60 s path, then shows average FPS, 1% low, p95, draw calls, triangles, backend, GPU, build, with Copy and Download buttons
- Bugs found and fixed: WebGPU stills striped on widths not a multiple of 64 px (three.js leaves the last readback row unpadded); Electron's `nativeImage` reads `@2x` file names as half-size Retina images (baselines now use `-dpr2`)
- Evidence (MacBook Air M1, Metal): tour 0.000% on 5 stops × 2 backends; deliberate baseline swap fails at 40% with a diff image; planted page error caught; responsive buffers e.g. 1440×900@2× → 1821×1138, 3440×1440 → 2225×931 (Medium budget); benchmark page 60 FPS avg, 56 FPS 1% low, 68 draw calls, 61k triangles at 960×540 (vsync-capped)

## Next
- Owner: open the preview in Chrome and Safari, and run `?bench=1` and `?bench=1&webgl=1` in each (closes M0.6 and M0.7, and the M0 gate).
- Then M1.4 Interaction (focus ray, pick up, inspect, drag via joint, throw, hinged doors, drawers; needs M1.3).

## Known issues
- Pointer lock could not be checked in the automated browser (it needs a real user click); the logic is covered by the scenario, the owner checks the real lock.
- No `linux-vulkan` baselines yet: the first cloud run creates them (the run passes) and must commit them. Cloud WebGPU runs on SwiftShader and is slow (about 66 s per still in M0.2); `npm run verify` there may take several minutes.
- The harness `bench` command reports CPU encode time only; draw calls and triangles come from `benchpage`, because three.js resets `renderer.info` inside its own animation loop.
- `bench` CPU numbers from the hidden harness window are not representative; use the owner's `?bench=1` files for budgets.
- B10G11R11 lightmaps would halve lightmap GPU memory but ktx 4.4.2 writes corrupt texels for that format (D-011).
- Raw Poly Haven sources live only on the owner's computer (§8.9), so M4.3 (materials to KTX2) must run there, or the owner commits processed files.
- Vite warns the main chunk is over 4000 kB raw (HDRI inlined as base64). Within budget; revisit in M6.2.

## Owner setup (answered 2026-10-21)
- Claude plan: Max ($100 tier), using Opus 5.5. Build runs stay on Opus 5.5; Fable only for a rare architecture or AI design review (MASTER_PLAN §12).
- Mac: MacBook Air M1, 8 GB unified memory, macOS 26.5.1, Chrome + Safari. It is the Medium-tier reference machine (§4.4) and the tightest memory target: 8 GB is shared by the OS, the browser and the GPU, so keep texture memory near the Low-tier budget (0.5 GB) until the owner's benchmark (M0.7) says otherwise.
- `python3` on the Mac is 3.13.2 and `bpy` 5.2.2 imports in `.venv`, so `bash tools/bootstrap.sh --blender --no-apt` works there (checked 2026-10-21).

- Windows PC: none. Windows browsers are covered by the Electron (Chromium) harness and outside testers at M6.3 (D-008).
- Target devices (owner, 2026-10-21): laptops and desktops only, Mac and Windows, every major browser; responsive to any window. Built in M0.9 (D-008).

## Questions for you
- Please open https://ganeshphutane-g.github.io/listening-post/ in Chrome and in Safari: does it show the corridor? Click it: does the mouse look around, do WASD/Shift/C/Q/E move you, does Esc show the pause screen, does F switch the torch? Then add `?bench=1` to the address, wait 62 s, press Download file; repeat with `?bench=1&webgl=1`. Send the four files.
- Shall I run `python3 tools/fetch_assets.py` on this Mac (downloads 595 MB of CC0 Poly Haven textures into `assets_src/`, not into git)? It is needed before the art pass (M4.3), not before.

## Usage note
- Run size (self-estimate): large (2-hour interactive session)
- Owner's weekly usage reading after this run: <filled by owner>
