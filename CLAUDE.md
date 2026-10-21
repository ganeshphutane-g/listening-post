# CLAUDE.md — LISTENING POST

Browser first-person horror game (three.js WebGPU + Rapier). [MASTER_PLAN.md](MASTER_PLAN.md) is the source of truth and is binding.

## Every run (MASTER_PLAN §0)

1. Bootstrap: `bash tools/bootstrap.sh` (add `--blender` only if the run bakes or exports; `--no-apt` on the owner's computer). Electron lands at `.tools/bin/electron`.
2. Read [HANDOFF.md](HANDOFF.md), the top of [BACKLOG.md](BACKLOG.md), and the last 20 entries of [DECISIONS.md](DECISIONS.md).
3. Pick **one** item: the first unchecked backlog item whose `Needs:` are all done. Never start a second.
4. Build it in small commits on `main` (`<item id>: <imperative summary>`). Keep `main` green.
5. Verify: `npm run verify`, then look at the screenshots (once the tour exists, M0.3).
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
| `npm run verify` | type check, unit tests, production build, JS gzip budget |
| `npm run assets:crate` / `npm run assets:corridor` | regenerate Blender assets into `public/assets/` (needs `bash tools/bootstrap.sh --blender`) |
| `xvfb-run -a .tools/bin/electron --no-sandbox tools/harness/shoot.cjs <url> <out.png> [mode]` | one frame through the Electron harness (serve with `npx vite preview` first) |

URL flags: `?webgl=1` force WebGL2 · `?shot=1` fixed frames + readback, sets title `SHOT_READY` · `?view=lightmap|uv` debug views · `?nopost=1` · `?frames=N` · `?diag=1`.
