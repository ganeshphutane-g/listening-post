# CLAUDE.md — LISTENING POST

Browser first-person horror game (three.js WebGPU + Rapier). [MASTER_PLAN.md](MASTER_PLAN.md) is the source of truth and is binding.

## Every run (MASTER_PLAN §0)

1. Bootstrap: `bash tools/bootstrap.sh` (add `--blender` only if the run bakes or exports, `--ktx` only if it encodes textures or lightmaps; `--no-apt` on the owner's computer). Electron lands at `.tools/bin/electron`, ktx at `.tools/ktx/bin/ktx`.
2. Read [HANDOFF.md](HANDOFF.md), the top of [BACKLOG.md](BACKLOG.md), and the last 20 entries of [DECISIONS.md](DECISIONS.md).
3. Pick **one** item: the first unchecked backlog item whose `Needs:` are all done. Never start a second.
4. Build it in small commits on `main` (`<item id>: <imperative summary>`). Keep `main` green.
5. Verify: `npm run verify`, then open `tests/visual/out/tour/*.png` and look at them. A visual change you did not intend is a failure; an intended one: `npm run tour -- --update` and commit the new baselines with the change.
6. Record: update [HANDOFF.md](HANDOFF.md) (template §8.4), tick [BACKLOG.md](BACKLOG.md), add to [DECISIONS.md](DECISIONS.md) (format §8.6), add a line to [CHANGELOG.md](CHANGELOG.md). Commit and push.
7. Stop when the acceptance test passes, or after three failed verify cycles on the item (revert, log the blocker in HANDOFF.md).

## Never

- add a paid service, API, SDK or asset;
- add an asset without a row in [docs/ASSETS.md](docs/ASSETS.md); use NC or unknown-licence assets;
- delete assets or rewrite a working system without tests covering it;
- commit secrets, tokens or personal data;
- change story, tone or a cut feature without the owner's answer in HANDOFF.md.

To change MASTER_PLAN.md: write a decision in DECISIONS.md first, then edit the plan in the same commit.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (WebGPU needs localhost or https) |
| `npm run verify` | type check, unit tests, build, JS gzip budget, asset ledger check, harness self-test, scenarios, screenshot tours, responsive check (MASTER_PLAN §8.8) |
| `npm run check:assets` | every file in `public/assets/` has a ledger row with an allowed licence and is ≤ 25 MiB |
| `python3 tools/fetch_assets.py --dry-run` | list the source assets in `content/asset_manifest.json` (owner's computer only: asset sites are blocked in sessions) |
| `npm run tour` / `npm run scenarios` / `npm run bench` | one harness command (needs `npm run build` first); options after `--`: `--backend webgpu\|webgl\|both`, `--size 1280x720`, `--dpr 2`, `--mode native\|vulkan\|swiftshader`, `--update`, `--verbose` |
| `npm run harness -- shoot [stop]` | one still per backend into `tests/visual/out/shoot/` |
| `npm run tour -- --view lightmap` | tours the lightmap debug view against its own baselines (part of verify) |
| `npm run benchpage` | runs the real `?bench=5` page on both backends and checks its results and buttons |
| `npm run responsive` | resizes the running game through laptop window sizes at 1× and 2× (no stretching, pixel budget, phone notice) |
| `npm run assets:crate` / `npm run assets:corridor` | regenerate Blender assets into `public/assets/` (needs `bash tools/bootstrap.sh --blender --ktx`); the corridor bake writes EXRs to `assets_src/` and encodes `corridor_lm.ktx2` |
| `node tools/pipeline/encode_lightmap.mjs <in.exr> <out.ktx2>` | denoised EXR → half-float KTX2, fails above 2 MB per 1024² |

URL flags: `?webgl=1` force WebGL2 · `?debug=1` sound-event log · `?bench=1` 60 s benchmark with copy/download (`?bench=N`, N ≥ 5: N-second run, not comparable) · `?device=touch` pretend to be a phone (shows the notice) · `?harness=1` test clock + `window.__harness`, sets title `HARNESS_READY` · `?view=lightmap|uv` debug views · `?nopost=1`.

Harness notes: `tools/harness/launch.mjs` wraps Electron in `xvfb-run` with `--no-sandbox` on Linux. Baselines live in `tests/visual/baselines/<platform>-<mode>/<backend>/` (`darwin-native` from the owner's Mac, `linux-vulkan` from cloud runs); a missing baseline is created and the run passes, so commit new ones. Add tour stops in `tests/visual/tour.json` and scenarios in `src/debug/harness.ts`.
