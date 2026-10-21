# Pipeline-test starter (21 Oct 2026)

The code that produced the verified browser render in MASTER_PLAN.md §2.1. Milestone M0.1 starts from it.

- `tools/make_crate.py` — procedural crate, Blender headless: `python3 tools/make_crate.py public/assets/crate.glb`
- `tools/bake_corridor.py` — corridor + Cycles lightmap bake + denoise: `python3 tools/bake_corridor.py public/assets 256 1024`
- `src/main.js` — three.js r186 WebGPU/WebGL2 scene: lightmap, flashlight, volumetric fog, SSR, bloom, grain, Rapier crates
- `tools/shoot.cjs` — Electron harness, render-target readback: see MASTER_PLAN.md §8.8

Run locally: `npm install`, then `npx vite` and open the printed localhost URL (WebGPU needs https or localhost).
Requires `pip install bpy==5.2.2` for the two Blender scripts.
