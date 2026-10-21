# HANDOFF — 2026-10-21 20:15 IST — run 2 (scheduled, cloud session)

## State
- Milestone: M0 Pipeline — 3/8 items (M0.1, M0.2, M0.8)
- Build: green — npm run verify: tsc strict OK; 4/4 unit tests; vite build OK; JS 2.03 MB gzip (limit 2.50 MB)
- Preview: none (local only: `npm run dev`)
- Repository: https://github.com/ganeshphutane-g/listening-post (public, branch `main`).

## This run
- Item: M0.2 Bootstrap — DONE
- Changes:
  - `tools/bootstrap.sh`: apt (mesa-vulkan-drivers, vulkan-tools, xvfb, Electron's shared libs), `npm ci`, Electron 45.0.0 from the GitHub release with SHA-256 pinned in the script (D-006), into `.tools/` (git-ignored), linked at `.tools/bin/electron`; prints every tool version and fails if any step fails
  - `--blender` installs bpy 5.2.2 into `.venv`; it needs Python 3.13 (D-007). `--no-apt` for the owner's computer. bash 3.2 compatible (macOS)
  - CLAUDE.md and `shoot.cjs` document the cloud command: `xvfb-run -a .tools/bin/electron --no-sandbox tools/harness/shoot.cjs <url> <out.png> [mode]`
- Evidence (cloud session, Ubuntu 24.04, 4 cores):
  - Fresh run (no `node_modules`, `.tools`, `.venv`): exit 0 in 9 s with apt packages present; first run with the apt install 34 s; `--blender` adds ~30 s. Versions printed: node 22.22.0, npm 10.9.4, three 0.186.1, rapier 0.21.0, @pmndrs/assets 1.7.0, typescript 5.9.3, vite 8.3.5, vitest 5.0.5, electron 45.0.0, xvfb 21.1.12, mesa-vulkan 25.2.8 (llvmpipe), bpy 5.2.2 LTS
  - Checksum check: a planted wrong hash made the run exit 1 with "checksum mismatch" and left nothing installed
  - Electron harness, `?shot=1`, served by `vite preview`: WebGL2 cratesResting=true, CPU 4.6 ms/frame, 15 s; WebGPU cratesResting=true, CPU 9.8 ms/frame, 66 s
  - Screenshots: `docs/screenshots/m0.2_cloud_webgpu.png`, `docs/screenshots/m0.2_cloud_webgl2.png` — looked at both: corridor, crates, lamp pool and red far glow present; the two backends match each other and the M0.1 Mac frames

## Next
- M0.3 Harness — first unblocked item (needs M0.2, now done).

## Known issues
- In mode `webgpu-vulkan` the WebGPU adapter reports `google / swiftshader`, not lavapipe, although `vulkaninfo` sees llvmpipe. Rendering is correct, just slow (66 s per shot). M0.3 should find out whether lavapipe can be used and add a `native` mode for macOS.
- Electron run as root needs `--no-sandbox` on the command line (the `appendSwitch` in `shoot.cjs` comes too late).
- `tools/harness/shoot.cjs` modes are Linux-oriented; on macOS pass any mode other than `webgpu-vulkan`/`webgpu-swiftshader` to use the native Metal adapter.
- Browser pane / hidden tabs pause requestAnimationFrame, so `?shot=1` stalls in a hidden tab. Use the Electron harness (backgroundThrottling off).
- Vite warns that the main chunk is over 4000 kB raw (the HDRI is inlined as base64). Within budget; revisit in M0.4/M6.2.
- Visual baselines are not stored yet (M0.3). The screenshots so far are reference images, not baselines.

## Owner setup (answered 2026-10-21)
- Claude plan: Max ($100 tier), using Opus 5.5. Build runs stay on Opus 5.5; Fable only for a rare architecture or AI design review (MASTER_PLAN §12).
- Mac: MacBook Air M1, 8 GB unified memory, macOS 26.5.1, Chrome + Safari. It is the Medium-tier reference machine (§4.4) and the tightest memory target: 8 GB is shared by the OS, the browser and the GPU, so keep texture memory near the Low-tier budget (0.5 GB) until the owner's benchmark (M0.7) says otherwise.
- `python3` on the Mac is 3.13.2 and `bpy` 5.2.2 imports in `.venv`, so `bash tools/bootstrap.sh --blender --no-apt` works there (checked 2026-10-21).

## Questions for you
- Do you have a Windows PC for testing? If yes: its GPU and the browsers you use. The plan targets Windows and macOS (§1); without a PC, Windows checks fall to the browser matrix at M6.3.

## Usage note
- Run size (self-estimate): small
- Owner's weekly usage reading after this run: <filled by owner>
