# Listening Post

A first-person horror vertical slice for the browser (three.js WebGPU with WebGL2 fallback, Rapier physics). Plan: [MASTER_PLAN.md](MASTER_PLAN.md). Build sessions start at [CLAUDE.md](CLAUDE.md).

```bash
npm ci
npm run dev       # open the printed localhost URL
npm run verify    # type check, unit tests, build, bundle budget
```

Blender asset scripts need `python3 -m venv .venv && .venv/bin/pip install bpy==5.2.2`, then `npm run assets:crate` and `npm run assets:corridor`.
