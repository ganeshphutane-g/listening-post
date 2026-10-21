# LISTENING POST — Master Build Plan (Browser Edition)

Version 1.0 · 21 October 2026 · Builder: Claude in scheduled sessions · Owner: you

**What this is.** The single source of truth for building a realistic first-person horror game that runs in the browser on Windows and macOS, using only free tools and assets. Every build session reads this file. It is written so a session with no memory of earlier sessions can still do the right next thing.

**How to read it.**

- **You (owner):** read §1 (goal), §2 (what is verified), §11 (what you do), §12 (models and connectors). Skim the rest.
- **Claude sessions:** read §0 first, every run. Treat everything here as binding. To change anything here, write a decision in `DECISIONS.md` first (format in §8.6), then edit this file in the same commit.

**Labels used throughout.** *Verified* = checked on 21 Oct 2026 by test or by opening the source. *Target* = a design goal, not a measurement. *Estimate* = a rough guess with wide error. *To test* = planned check, not done yet.

---

## Contents

0. Session protocol (every run)
1. North star and non-negotiables
2. Verified facts (21 Oct 2026)
3. Game design
4. Technical architecture
5. Realism playbook
6. Assets: sources, fetch routes, ledger, budgets
7. Hosting and distribution
8. Autonomous operation (scheduling, memory files, templates, verification)
9. Milestones and backlog (M0–M6, with acceptance tests)
10. Risks and mitigations
11. What the owner does
12. Models and connectors
13. Sources

---

## 0. Session protocol (every run)

Each run is a fresh session with an empty disk. The repository is the only memory.

1. **Attach and clone** the repository with push access.
2. **Bootstrap:** `bash tools/bootstrap.sh`. It installs pinned versions (§4.1): npm packages (`npm ci`), the Electron runtime from GitHub releases with checksum check, Blender as a Python module (`pip install bpy==5.2.2`), and the software Vulkan driver plus virtual display (`apt-get install mesa-vulkan-drivers xvfb`). Export or bake tools only on runs that need them.
3. **Read** `HANDOFF.md`, the top of `BACKLOG.md`, and the last 20 entries of `DECISIONS.md`.
4. **Pick one item:** the first unchecked backlog item whose `Needs:` are all done. If it is blocked, note why in `HANDOFF.md` and take the next one. Never start a second item in the same run.
5. **Build it** in small commits on `main`. Keep `main` green.
6. **Verify:** `npm run verify` (§8.8). Then open the screenshot-tour images and look at them. Compare with the baselines in `tests/visual/baselines/`. A visual change that was not intended is a failure.
7. **Record:** update `HANDOFF.md` (template §8.4), tick the item in `BACKLOG.md`, add decisions to `DECISIONS.md`, add a line to `CHANGELOG.md`. Commit and push.
8. **Stop** when the item's acceptance test passes, or when the step budget for the run is spent (§8.3). If the budget runs out first: revert uncommitted work, push a note in `HANDOFF.md` describing the blocker and what you tried.

Never, in any run:

- add a paid service, API, SDK or asset;
- add an asset without a ledger entry in `docs/ASSETS.md`;
- use an asset under a non-commercial (NC) or unknown licence;
- delete assets or rewrite a working system without tests that cover it;
- commit secrets, tokens or personal data;
- change the story, tone or a cut feature without the owner's answer in `HANDOFF.md`.

---

## 1. North star and non-negotiables

**Goal.** A first-person horror vertical slice, 45 to 90 minutes long (target), that looks and sounds as real as free tools allow, playable in Chrome, Edge, Firefox and Safari on Windows and macOS laptops and desktops (D-008: no phones or tablets).

**Definition of "realistic" for this project** (targets, each checked as listed in §5):

| Aspect | Target | How it is checked |
| --- | --- | --- |
| Light | Baked global illumination on all static geometry; a shadowed, dynamic flashlight; no flat ambient light | Screenshot tour; lightmap debug view |
| Materials | Photo-scanned PBR materials on every surface the player can touch | Ledger shows a scanned source for each material |
| Camera | Filmic tone mapping (AgX), exposure set per zone, fine grain, stable anti-aliasing | Screenshot tour; owner's GPU screenshots |
| Air | Volumetric fog and dust that the flashlight cuts through | Screenshot tour |
| Motion | Motion-captured animation for humans; procedural motion for the creature | Owner playtests |
| Sound | Positional (HRTF) audio, room reverb, sound occlusion through walls and doors | Scenario tests; owner playtests |
| Interaction | Physically simulated doors, objects and barricades | Scenario tests |

**Non-negotiables.**

- Free only. The one paid item is the owner's existing Claude plan.
- Licence-clean: CC0, CC-BY (credited), MIT, Apache-2.0, or explicitly royalty-free. Nothing non-commercial.
- Plan usage for this project stays at or under 60% of the owner's limits (§8.3).
- No realistic human faces in close-up (masks, hoods, darkness); this is where free assets fail first.
- Basic accessibility: subtitles, remappable keys, adjustable field of view, motion effects can be turned off.

---

## 2. Verified facts (21 Oct 2026)

### 2.1 Browser pipeline test (run in the build workspace)

| Check | Result |
| --- | --- |
| Lightmap bake | Corridor modelled by a Blender script; Cycles on 2 CPU cores, 256 samples, 1024×1024 lightmap: 75 s; OpenImageDenoise pass: 2 s |
| Rendering | three.js 0.186.1 `WebGPURenderer`: baked lightmap, shadowed flashlight, ray-marched volumetric fog at quarter resolution, screen-space reflections, bloom, film grain, SMAA, AgX tone mapping |
| Backends | Rendered through WebGPU (CPU SwiftShader adapter) and through the WebGL2 fallback; the two frames match |
| Speed on CPU | WebGPU path: 24 frames plus start-up in about 115 s at 960×540; WebGL2 path: 12 frames in about 8 s |
| Physics | Rapier 0.21: six stacked and dropped crates all at rest; self-test passed in both backends |
| Free assets via npm | `@pmndrs/assets` (CC0) HDRI used for reflections on dynamic objects |
| Bundle | three.js WebGPU build + Rapier + HDRI: 4.6 MB raw, 1.8 MB gzip |
| Lightmap size | 1024² EXR: 12.6 MB raw. Must be compressed for the web (M0.4) |

Lessons from the test that are now rules:

- WebGPU needs a secure context: `navigator.gpu` was missing on a `data:` page and present on `http://localhost`.
- The browser's own screenshot of a WebGPU canvas came back blank. Automated screenshots must read pixels from a render target (`renderer.readRenderTargetPixelsAsync`), as the harness now does.
- Blender bakes are stored bottom-up while glTF UVs are top-down: flip V once on the lightmap UVs. The test caught this with a lightmap debug view; keep that view.
- Raw path-traced bakes are speckled; always denoise.

### 2.2 Platform facts

| Fact | Value | Source |
| --- | --- | --- |
| WebGPU in Chrome and Edge | macOS from 113; Windows needs Direct3D 12; Linux not yet | web.dev, Nov 2025 |
| WebGPU in Firefox | Windows from 141; macOS only on Tahoe 26 with Apple Silicon, from 145 | web.dev, Nov 2025 |
| WebGPU in Safari | Safari 26 on macOS Tahoe 26 | web.dev, Nov 2025 |
| three.js fallback | `WebGPURenderer` falls back to a WebGL2 backend when WebGPU is unavailable | three.js source, r186 |
| Godot 4 on the web | WebGL2 Compatibility renderer only; Forward+ not available | Godot docs |
| Shell network in build sessions | npm, PyPI and GitHub (git, raw files, release downloads) reachable; Poly Haven, ambientCG, Kenney's site, Freesound, Hugging Face and jsDelivr blocked | tested |

### 2.3 Hosting limits

| Host | Free terms | Source |
| --- | --- | --- |
| itch.io (HTML5) | Up to 500 MB extracted, 1,000 files, 200 MB per file; you set itch's revenue share 0–100% (default 10%) | itch.io docs |
| GitHub Pages | Free for public repositories only on GitHub Free; site up to 1 GB; soft limit 100 GB bandwidth a month | GitHub docs |
| Cloudflare Pages | 20,000 files, 25 MiB per file, 500 builds a month; custom headers via `_headers` | Cloudflare docs |
| GitHub Free storage | Large-file storage 10 GiB and bandwidth 10 GiB a month; repositories up to 10 GB recommended; 100 MB per file enforced | GitHub docs |

### 2.4 Licences (stack and assets)

| Item | Licence | Notes |
| --- | --- | --- |
| three.js 0.186.1 | MIT | |
| Rapier (`@dimforge/rapier3d-compat` 0.21.0) | Apache-2.0 | WASM embedded, single-threaded |
| recast-navigation 0.43.1 | MIT | Navmesh generation and crowd agents |
| glTF-Transform 4.5.1, meshoptimizer 1.3.0 | MIT | Asset optimisation |
| Vite 8.3.5, Vitest 5.0.5 | MIT | Build and unit tests |
| Electron 45.0.0 | MIT | Headless browser for tests |
| pixelmatch 8.0.0 | ISC | Screenshot diffs |
| Babylon.js 9.31.2 / Havok 1.3.14 | Apache-2.0 / MIT | Alternative engine (not chosen) |
| KTX-Software | Apache-2.0 | Texture compression tools |
| Blender 5.2.2 LTS | GPL | Tool only; outputs are yours |
| `@pmndrs/assets` 1.7.0 | CC0 | HDRIs, normal maps; ships on npm |
| Kenney Starter Kit FPS (GitHub) | Code MIT; sprites, models, sounds CC0 | Reachable by git from the build workspace |
| Poly Haven | Assets CC0, no credit needed | Their public API is free for any use but asks for a "Powered by Poly Haven" credit |
| ambientCG | CC0 | Via a licence guide; confirm on their site |
| Quaternius | CC0 | Via a third-party guide; confirm on their site |
| MakeHuman exports | CC0, commercial use allowed | Some community add-ons are CC-BY |
| Mixamo | Free with an Adobe ID; royalty-free in commercial games | Redistributing raw files not addressed; ship only baked game files |
| Sonniss GDC 2026 bundle | Royalty-free, no attribution (per article, 7.47 GB) | Read the licence bundled with the download |
| Freesound | CC0, CC-BY, CC-BY-NC | CC0 and CC-BY only |
| TRELLIS (image to 3D, optional) | MIT | Needs an NVIDIA GPU with 16 GB or more |
| Kokoro (text to speech, optional) | Apache-2.0 | Model weights download from Hugging Face (blocked here) |
| Piper (text to speech, optional) | MIT | Voice licences vary; check each voice |

### 2.5 Claude plan facts

- Paid plans have a session limit that resets every five hours and weekly limits; use on claude.ai, Claude Code and the desktop app counts toward the same limits.
- Current use is shown under Settings, Usage.
- Fable models: on Max, up to 50% of the weekly limits at no extra cost and they use limits faster; on Pro they run on paid usage credits.
- Scheduled tasks exist on all paid plans and run remotely even while the owner's computer sleeps.

---

## 3. Game design

### 3.1 Premise

1978 (setting year; fictional). **Station K-7**, a signals-intelligence listening post buried under a mountain. The night-shift analyst, **Ilse Varga**, is alone on duty when the deep antenna array picks up something that is not a signal. Containment fails. Something now moves through the station hunting by sound. An hour later a four-person cleanup team arrives with orders to recover the recordings and leave no witnesses.

Tone: slow-burn dread, procedural realism, no jump-scare spam. The station is a working machine: pumps, relays, teleprinters, ventilation. Its noises are both cover and danger.

### 3.2 Player fantasy

You are the smartest listener in the building. You win by hearing, deducing and manipulating, not by shooting. Information is your weapon: who is where, what they believe, what they will do next.

### 3.3 Setting: three levels

| Level | Spaces | Mood | Main mechanic introduced |
| --- | --- | --- | --- |
| L1 Receiving | Entry tunnel, guard post, mess hall, dormitory, washroom, records office | Lived-in, recently abandoned | Movement, flashlight, doors, hiding, first creature hearing |
| L2 Signals Hall | Listening booths, teleprinter room, archives, power room, generator gallery | Machine noise, flicker | Wall microphones, radio scanner, power routing |
| L3 Antenna Wells | Pump rooms (partly flooded), cable vaults, antenna shaft, service lift | Wet, cold, cavernous | Water noise, squad hunts, spoofing, finale |

Finale: reach the surface lift with the recordings while both the squad and the creature converge.

### 3.4 Core loop

Listen → infer positions → choose a route → move quietly, hide, lure or fight → survive the encounter → collect intel (documents, recordings, radio traffic) → open the next area.

### 3.5 Systems

1. **Sound simulation (shared).** Every action emits a sound event: footsteps (by surface and speed), doors, impacts (by physics impulse), machines, voices. Events spread through a graph of rooms and openings. The creature hears through this graph; so do the wall microphones and the player's scanner.
2. **Light exposure.** How visible the player is depends on the flashlight state and on the light at the player's position, read from the lightmap and from dynamic lights.
3. **The creature (the Listener).** Blind in practice, extraordinary hearing, poor at stairs and ladders, cannot open locked doors but can break barricades given time. Cannot be killed until the finale.
4. **The squad (Cleaners).** Four soldiers with flashlights and radios. Methodical sweeps, cover use, shared knowledge. They also fear the creature and will shoot at noise.
5. **Radio intel and spoofing.** The scanner picks up squad traffic generated from what each soldier knows and plans. From L3, a captured transmitter lets the player send forged reports that change the squad's beliefs (credibility drops if reports contradict what they see).
6. **Adaptive stalking.** The creature counts the player's favourite hiding spots, routes and tricks; it checks favourite spots more often and stops falling for a repeated lure.
7. **Physical improvisation.** Pick up, drag, throw, stack, barricade. Barricades are joints that break under force; the creature tests them.
8. **Power routing.** Breaker panels decide which lights, doors and machines run. More power means more light and more noise.
9. **Flashlight.** Battery with slow drain; flickers when low; spare batteries are rare.
10. **Health.** Two hits from the creature end the run; injuries add audible breathing and slower sprint. No health bar.

### 3.6 Encounter and story beats (target 45–90 minutes)

| # | Beat | Teaches or tests |
| --- | --- | --- |
| 1 | Shift handover note, routine checks in L1 | Movement, interaction, documents |
| 2 | The array alarm; power dips; a voice that is not a voice on the line | Atmosphere, flashlight |
| 3 | First encounter: the Listener passes the dormitory while you hide | Hiding, silence |
| 4 | Records office: the station's secret (what the array was listening for) | Story, deduction board |
| 5 | L2 power room: restore power to the lift, but the generators are loud | Power routing, noise trade-off |
| 6 | The squad arrives; first radio intercept | Scanner, squad behaviour |
| 7 | Archives: retrieve the reels while squad and creature sweep | Combined threat, luring |
| 8 | A soldier is taken; the squad becomes erratic | Emergent fear in the AI |
| 9 | L3 flooded pump rooms: water hides footsteps but slows you | Environment as tool |
| 10 | Capture a transmitter; first spoof | Spoofing |
| 11 | Antenna shaft: the creature's origin, seen only in silhouette | Story climax, restraint |
| 12 | Finale: route both threats into each other and reach the lift | Mastery of every system |

### 3.7 Saves, failure, difficulty

- Checkpoint saves at teleprinter terminals (manual) and at level transitions (automatic).
- On death: reload the last checkpoint; the creature keeps what it learned this run (so retrying the same trick gets harder).
- Difficulty: Story (creature hearing −40%, squad accuracy −50%), Standard, Hard (no manual saves).

### 3.8 Controls

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Move / look | WASD / mouse | Left stick / right stick |
| Sprint / crouch | Shift / C or Ctrl (hold or toggle) | Left stick click / B |
| Lean | Q / E | Left / right bumper |
| Interact, grab | Left click (hold to drag) | Right trigger |
| Throw, inspect | Right click | Left trigger |
| Flashlight | F | D-pad up |
| Radio scanner | R | D-pad right |
| Journal and deduction board | Tab | View button |
| Pause | Esc (also releases the mouse) | Menu button |

All keys remappable; mouse look needs a click to lock the pointer (browser rule).

### 3.9 Interface

Diegetic first: the scanner, a wristwatch for time, paper documents. Minimal overlay: interaction prompt, subtitles, a small breathing and heartbeat cue when injured. No minimap, no enemy markers.

### 3.10 Content targets (target counts for the slice)

Rooms: about 30. Interactable props: about 120. Documents: 25. Radio line templates: 150 or more, generated into about 400 audio lines. Unique sound effects: about 250. Music: 6 stems plus stingers.

---

## 4. Technical architecture

### 4.1 Stack (pinned)

| Layer | Choice | Version |
| --- | --- | --- |
| Language | TypeScript (strict) | latest 5.x via npm |
| Renderer | three.js `WebGPURenderer` with automatic WebGL2 fallback; TSL node materials and post-processing | 0.186.1 |
| Physics | Rapier (`@dimforge/rapier3d-compat`) | 0.21.0 |
| Navigation | recast-navigation (`@recast-navigation/three`) | 0.43.1 |
| Ray queries | three-mesh-bvh | 0.9.16 |
| Asset optimisation | glTF-Transform, meshoptimizer, KTX-Software | 4.5.1, 1.3.0, release from GitHub |
| Build | Vite | 8.3.5 |
| Unit tests | Vitest | 5.0.5 |
| Headless browser tests | Electron (Chromium) under a virtual display | 45.0.0 |
| Visual diffs | pixelmatch | 8.0.0 |
| Content tools | Blender as a Python module (`bpy`) | 5.2.2 LTS |

Decision D-001 (engine): three.js over Babylon.js, PlayCanvas and Godot web.

- three.js: verified end to end here today; its TSL post-processing ships SSR, GTAO, SSGI, TRAA, bloom, god rays, LUT grading, film grain, motion blur and depth of field; code-first and fully scriptable.
- Babylon.js: more built in (Havok physics, inspector, audio engine); a strong alternative if three.js blocks a needed feature.
- PlayCanvas: its editor is a cloud service; less suited to headless sessions.
- Godot web: WebGL2 only, so no volumetric fog or screen-space GI on the web.

### 4.2 Repository layout

```
/
├─ CLAUDE.md            short session protocol (copy of §0) — sessions read it first
├─ MASTER_PLAN.md       this file
├─ HANDOFF.md  BACKLOG.md  DECISIONS.md  CHANGELOG.md
├─ index.html  package.json  vite.config.ts  tsconfig.json
├─ src/
│  ├─ main.ts           boot: renderer choice, loading, main loop
│  ├─ core/             fixed-step loop, time, event bus, config, save, settings, telemetry
│  ├─ render/           renderer setup, pipeline, quality tiers, materials, lightmaps, probes, decals
│  ├─ world/            zones, streaming, rooms and portals, doors, interactables, power grid
│  ├─ physics/          Rapier world, character controller, joints, impact events
│  ├─ player/           input, controller, flashlight, inventory, interaction, health
│  ├─ ai/               perception, beliefs, utility, creature, squad, radio, director, learning, nav
│  ├─ audio/            engine, HRTF sources, reverb zones, occlusion, music, radio filter
│  ├─ ui/               menus, prompts, subtitles, scanner, journal and deduction board
│  └─ debug/            overlays, AI inspector, bots, benchmark
├─ content/             data: layout.json, rooms.json, objectives.json, ai_tuning.json, radio grammar, documents
├─ public/assets/       processed, game-ready assets (glb, ktx2, audio), each in the ledger
├─ tools/
│  ├─ bootstrap.sh
│  ├─ blender/          kit generators, prop generators, bake scripts, exporters
│  ├─ pipeline/         gltf-transform scripts, lightmap encoding, texture compression, manifest
│  ├─ harness/          Electron runners: shoot, tour, scenarios, bench
│  ├─ audio/            impulse responses, procedural sound, radio voice batch
│  └─ fetch_assets.py   runs on the OWNER's computer (asset sites are blocked in sessions)
├─ tests/  unit/  scenarios/  visual/ (tours + baselines)
└─ docs/   GDD.md  TECH.md  ART_BIBLE.md  ASSETS.md  PLAYTESTS.md
```

### 4.3 Runtime architecture

- **Loop:** fixed 60 Hz simulation step (physics, player, sound propagation); AI thinks at 10 Hz with staggered agents; rendering runs every animation frame with interpolation.
- **Event bus:** typed events (`SoundEvent`, `DoorChanged`, `PowerChanged`, `RadioMessage`, `PlayerSeen`, `Checkpoint`). Systems talk only through events and shared data.
- **Data-driven tuning:** all numbers a designer would tweak live in `content/*.json`. Sessions tune numbers there, not in code.
- **Determinism for tests:** a seeded random generator; a test clock; physics stepped manually in tests.

### 4.4 Rendering pipeline

1. **Static world:** meshes from Blender with lightmap UVs; lightmaps baked in Cycles with denoising, one atlas per zone; surface detail from scanned materials plus world-space detail noise.
2. **Dynamic objects:** lit by the flashlight, by a few dynamic lamps, and by baked light probes (spherical harmonics) and reflection cubemaps placed per room.
3. **Flashlight:** spot light with a 1024–2048 shadow map, a cookie texture for a real beam pattern, slight lag behind the camera.
4. **Volumetrics:** ray-marched fog box per zone at quarter resolution, blurred, lit by the flashlight and selected lamps (lamps that light the fog only, since their surface light is already baked).
5. **Post chain (WebGPU High):** scene pass with normal, depth, metal-roughness and velocity targets → GTAO (dynamic objects) → SSR on wet and polished surfaces → fog composite → bloom → LUT colour grade → film grain and slight chromatic aberration → TRAA.
6. **Exposure:** per-zone exposure set by hand, smoothed when crossing zones.

Quality tiers (targets; auto-detected on first run, adjustable):

| Tier | Typical hardware | Backend | Shadows | Fog | Reflections | Anti-aliasing | Extras |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Low | Integrated GPU, older Mac | WebGL2 or WebGPU | 1024 flashlight only | 8 steps, quarter res | Probes only | FXAA | — |
| Medium | Entry discrete GPU, Apple M1 | WebGPU | 1024 | 12 steps | SSR half res | TRAA | Bloom |
| High | Mid-range GPU, Apple M2 Pro or newer | WebGPU | 2048 | 14 steps | SSR full res | TRAA | GTAO, bloom, grading |
| Ultra | High-end GPU | WebGPU | 2048 | 16 steps | SSR full res | TRAA | SSGI, motion blur, depth of field |

### 4.5 Asset pipeline

1. **Source:** Blender scripts generate the modular kit and props (`tools/blender/`), or scanned assets arrive from §6 sources.
2. **Bake:** per-zone Cycles bake (diffuse direct + indirect) → OpenImageDenoise → EXR.
3. **Encode lightmaps** (decide in M0.4 by test): RGBM 8-bit in KTX2 versus HDR KTX2. Pass criteria: no visible banding in dark gradients, at most 2 MB per 1024² map (target).
4. **Optimise meshes and textures:** glTF-Transform `dedup`, `prune`, `weld`, `meshopt` compression; textures to KTX2 (ETC1S for colour, UASTC for normal and roughness maps).
5. **Manifest:** `public/assets/manifest.json` lists every file, its zone, size and ledger id; the loader streams by zone.
6. **Checks:** a pipeline test fails if a file lacks a ledger entry, exceeds its size budget, or is missing LODs where required.

### 4.6 Physics

- Rapier kinematic character controller for the player (step offset, slope limit, crouch shape swap).
- Rigid bodies for props with sleeping; continuous collision detection for thrown objects.
- Revolute joints for doors (hand-dragged with a spring); fixed joints with break thresholds for barricades.
- Impact events → `SoundEvent` loudness from impulse and material pair.
- Ragdolls for the squad (capsules joined by spherical joints), switched in on death.

### 4.7 Navigation and AI

- **Navmesh:** baked per zone at build time with recast-navigation; door links toggle with door state; vent links only for the creature.
- **Room graph:** rooms and openings (doors, vents, windows) with acoustic properties, authored in `content/rooms.json` and validated against geometry.
- **Sound propagation:** shortest-path loudness over the room graph. Loss per opening by state (open, ajar, closed, sealed) and about 6 dB per doubling of distance (inverse-square law). Starting values in `content/ai_tuning.json`.
- **Perception:** vision cone with raycasts to several body points (three-mesh-bvh), scaled by light exposure and movement; hearing from the propagation result with position error that grows with distance and quietness; a suspicion meter so detection is gradual and readable.
- **Beliefs:** last known position plus a probability over rooms that spreads through openings each second and decays.
- **Decisions:** utility scoring over patrol, investigate, search, hunt, chase, ambush, retreat. Every score is visible in the debug overlay.
- **Learning:** decaying counters of the player's hiding spots, routes and lures raise search priors and lower lure response.
- **Squad:** shared blackboard over radio; sweep patterns; cover selection; panic state after losses.
- **Radio:** messages built from a grammar fed by squad state (callsigns, room names, intent). Spoofed messages enter the same blackboard with a credibility score.
- **Director:** tension from proximity, line of sight and recent chases. It enforces quiet stretches after a chase and keeps the creature within earshot when tension stays low too long. It never places the creature in view or teleports it.

### 4.8 Audio

- Web Audio graph started on the first click (browser rule).
- Positional sources with HRTF panning (three.js `PositionalAudio` defaults to HRTF).
- Room reverb: convolution with impulse responses generated per room size and material (`tools/audio/`), cross-faded at openings.
- Occlusion: low-pass and gain from the room-graph path (the same data the AI uses).
- Music: layered stems driven by director tension; stingers only on real events.
- Radio voice: lines synthesised offline (owner's PC, §12), then a radio filter chain (band-pass, saturation, noise) that also hides synthetic artefacts.
- Formats: lossless masters in source control; compressed delivery format chosen in M0 by testing every target browser.

### 4.9 Saves, settings, telemetry

- Saves in IndexedDB (checkpoint state as JSON); settings in local storage.
- Telemetry stays local: an exportable session log (deaths, positions, encounter timeline, frame times) for playtests. Nothing is sent anywhere.

### 4.10 Browser rules

- Serve over HTTPS (WebGPU needs a secure context).
- Pointer lock and audio need a user gesture; the title screen's Play button grants both.
- Pause when the tab is hidden; release the pointer on Esc and show the pause menu.
- Handle WebGPU device loss: save settings, reload the page into the last checkpoint.
- Laptops and desktops only (D-008). The game adapts to any window: sizes from 1280×720 up to 3440×1440 and 4K, aspect ratios 16:9, 16:10, 3:2 and 21:9, device pixel ratios 1 to 2 (Retina, scaled Windows displays), browser zoom, resizing and fullscreen. The view keeps a horizontal field of view the player sets, so wider screens see more, not a stretched image. Render resolution follows a render-scale setting capped by the quality tier, not the raw pixel ratio. Interface text and prompts scale with the window height. On a phone or tablet (touch-only, no fine pointer) the game shows a notice that it needs a laptop or desktop browser instead of starting.
- Pre-compile shaders during loading (`renderer.compileAsync`) to avoid stutter on first sight of a material.
- Pool objects in hot paths; watch for garbage-collection spikes in the benchmark.

### 4.11 Budgets (targets, revisited at M4)

| Budget | High tier | Low tier |
| --- | --- | --- |
| Frame time at 1080p | 16.6 ms | 33 ms |
| Draw calls per frame | 400 | 250 |
| Visible triangles | 2 million | 0.8 million |
| Texture memory | 1 GB | 0.5 GB |
| First playable download | 60 MB compressed | same |
| Full slice download | 450 MB (fits itch.io's 500 MB) | same |
| Largest single file | 25 MiB (fits Cloudflare Pages) | same |

---

## 5. Realism playbook (ranked by impact per cost)

Status: *Verified* = ran in the pipeline test; *Available* = present in three.js 0.186.1, not yet tested here; *Planned* = needs assets or code.

| Rank | Technique | What it adds | Runtime cost | Status | How a session checks it without a GPU | What the owner checks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Baked GI lightmaps with denoising | Soft bounce light, contact shadows, colour bleed | Almost none | Verified | Lightmap debug view; tour diff | Screenshots on GPU |
| 2 | Scanned PBR materials (2K, KTX2) | Real surface detail | Texture memory | Planned | Material validation script; tour | Close-up screenshots |
| 3 | Shadowed flashlight with cookie | The main interactive light | One shadow map | Verified (without cookie) | Tour | Feel in play |
| 4 | Volumetric fog and dust | Depth, atmosphere, visible beams | Medium | Verified | Tour | Banding, shimmer |
| 5 | Sound realism: HRTF, reverb, occlusion | Often the biggest perceived realism gain in horror | Low | Planned | Scenario tests on the propagation graph | Headphones playtest |
| 6 | Filmic camera: AgX, exposure per zone, grain, slight aberration | Photographic look | Low | Verified (AgX, grain) | Tour | Overall look |
| 7 | TRAA temporal anti-aliasing | Stable, film-like edges | Low to medium | Available | Tour (static frames only) | Motion shimmer |
| 8 | Reflection probes baked in Blender | Believable metal, glass, wet surfaces | Low | Planned | Probe debug view | Close-ups |
| 9 | Screen-space reflections | Moving reflections on wet floors | Medium to high | Verified | Tour | Artefacts at screen edges |
| 10 | Decals: grime, water stains, blood, signage | Breaks repetition | Low | Available | Tour | Repetition |
| 11 | Dense clutter with instancing | Lived-in spaces | Draw calls | Planned | Budget check | Walkthrough |
| 12 | Motion-captured animation, foot IK, procedural layers | Believable bodies | CPU | Planned | Animation test scene renders | Playtest |
| 13 | Particles in light: dust motes, drips, steam | Air you can see | Low | Planned | Tour | Playtest |
| 14 | GTAO for dynamic objects | Grounding of props and characters | Medium | Available | Tour | Close-ups |
| 15 | Screen-space GI for dynamic objects (Ultra) | Bounce light on moving things | High | Available | Tour | Benchmark cost |

---

## 6. Assets: sources, fetch routes, ledger, budgets

### 6.1 Sources and who fetches them

| Need | Source | Licence | Route |
| --- | --- | --- | --- |
| Concrete, metal, rust, tiles, wood, floors | Poly Haven, ambientCG | CC0 | Owner runs `tools/fetch_assets.py` once (sessions cannot reach these sites) |
| Sky and interior HDRIs | `@pmndrs/assets` on npm; Poly Haven | CC0 | npm in sessions; script for Poly Haven |
| Props (scanned) | Poly Haven models | CC0 | Script |
| Props (simple) | Kenney Starter Kit FPS on GitHub, Quaternius | CC0 | Git in sessions (Kenney); owner downloads Quaternius |
| Architecture kit, consoles, radios, pipes, cabinets | Generated by Blender scripts | Ours | Sessions |
| Human bodies | MakeHuman desktop app | CC0 exports | Owner exports with settings in `docs/ART_BIBLE.md` |
| Human animation | Mixamo | Royalty-free with Adobe ID | Owner downloads the list in `content/mixamo_list.json` |
| Sound effects | Sonniss GDC bundle; Freesound (CC0, CC-BY); Kenney audio | As listed in §2.4 | Owner downloads the subset in `content/sfx_list.json` |
| Ambience, drones, interface sounds, impulse responses | Generated in code | Ours | Sessions |
| Radio voices | Kokoro or Piper on the owner's PC (optional) | Apache-2.0 / MIT (check voice) | Owner runs `tools/audio/voice_batch.py` |

`tools/fetch_assets.py` (written in M0.5) reads `content/asset_manifest.json`, downloads each listed asset at the chosen resolution, writes the files under `assets_src/`, and appends ledger rows. If it uses Poly Haven's API, the credits screen includes "Powered by Poly Haven".

### 6.2 Ledger (`docs/ASSETS.md`)

| id | files | source URL | author | licence | changes made | used in |
| --- | --- | --- | --- | --- | --- | --- |
| A-0001 | `public/assets/mat/concrete_wall_02/*` | (page URL) | Poly Haven | CC0 | 2K, KTX2 | L1, L2 walls |

The credits screen is generated from the ledger. A pipeline test fails on any file without a row.

### 6.3 Art bible essentials (expanded in `docs/ART_BIBLE.md` at M4.1)

- Palette: sodium orange, fluorescent green-white, emergency red; nothing saturated elsewhere.
- Light ratios: most of the frame below 10% brightness; one readable light source per view.
- Materials: wet floors in L3 only; dust and grime in corners and under fixtures.
- Shapes: 1970s Eastern-bloc utilitarian; rounded steel doors, cable trays, bakelite.
- Humans: masks, hoods, helmets; never a lit face in close-up.
- Creature: tall, wrong proportions, seen in fragments; defined by movement and sound.

---

## 7. Hosting and distribution

| Use | Channel | Why | Status |
| --- | --- | --- | --- |
| Private playtest previews | A private Claude artifact page | No accounts to set up; the owner opens it on their own GPU | To test in M0.6: page up to 16 MB, binary files up to 15 MB each, up to 256 MB per version (published limits of the artifact tool); WebGPU and WASM behaviour unknown there |
| Private previews, fallback | Cloudflare Pages | Free, custom headers, 25 MiB per file | Needs the owner's Cloudflare account |
| Public mirror | GitHub Pages | Free | Only if the repository is public |
| Public release | itch.io | Free; 500 MB and 1,000 files fit the budget | M6 |
| Desktop app (optional, later) | Electron wrapper | Free | Same unsigned-app warnings as native builds; not planned for the slice |

The game works offline after the first visit through a service worker cache (M6.2).

---

## 8. Autonomous operation

### 8.1 Scheduling

- One scheduled task, created after M0 setup. Week 1 cadence: once a day, overnight in the owner's time zone (Asia/Kolkata).
- Each run starts fresh, attaches the repository, follows §0.
- Turn on automatic approval for the task if the organisation allows it; otherwise a run that needs an approval stops and waits.

### 8.2 Scheduled task prompt (exact text)

```
Continue the browser horror game in the GitHub repository <OWNER>/<REPO>.
Attach it with push access and clone it. Then follow CLAUDE.md exactly:
run tools/bootstrap.sh; read HANDOFF.md, the top of BACKLOG.md and the last
20 entries of DECISIONS.md; do only the first unblocked backlog item; run
npm run verify and look at the screenshot tour; commit and push; update
HANDOFF.md, BACKLOG.md, DECISIONS.md and CHANGELOG.md. Do not start a second
item. If an item needs the owner's decision, write the question under
"Questions for you" in HANDOFF.md and stop. Never add paid services or any
asset without a ledger entry.
```

### 8.3 Usage policy (cap: 60% of the owner's limits)

- Sessions cannot read the usage meter, so the cap is enforced by calibration.
- Week 1: one run a day. The owner notes the weekly bar after each run in `HANDOFF.md` ("Usage note").
- If one run costs X% of the weekly limit, the cadence is 55 ÷ X runs a week (5-point margin).
- Space runs at least five hours apart, overnight where possible, so runs never consume the session limit the owner needs during the day.
- Step budget per run: one backlog item. A run that hits three failed verification cycles on the same item stops, reverts and logs the blocker.
- No parallel sub-agents in scheduled runs.
- Model: see §12.

### 8.4 `HANDOFF.md` template

```
# HANDOFF — <YYYY-MM-DD HH:MM IST> — run <n>

## State
- Milestone: <M#> <name> — <done>/<total> items
- Build: <green|red> — npm run verify: <summary line>
- Preview: <link or "none">

## This run
- Item: <id> <title> — <DONE|PARTIAL|BLOCKED>
- Changes: <3–6 bullets>
- Evidence: tests <names>; screenshots <paths>; budgets <draw calls, triangles, CPU ms>

## Next
- <id> <title> — why it is next

## Known issues
- <bullets>

## Questions for you
- <bullets, or "none">

## Usage note
- Run size (self-estimate): <small|medium|large>
- Owner's weekly usage reading after this run: <filled by owner>
```

### 8.5 Backlog item format (`BACKLOG.md`)

```
- [ ] M1.3 Flashlight
  - Do: spot light on the camera with lag, cookie texture, battery drain, low-battery flicker, toggle
  - Accept: tour frame shows the cookie pattern; unit test drains a full battery in 900 s of on-time (tunable)
  - Needs: M1.2
  - Est: 1 run
```

### 8.6 Decision record format (`DECISIONS.md`)

```
## <YYYY-MM-DD> D-<nnn> <title>
- Context: <why a decision was needed>
- Decision: <what was chosen>
- Alternatives: <what else and why not>
- Consequences: <what this changes>
- Revisit when: <trigger>
```

### 8.7 Playtest feedback template (`docs/PLAYTESTS.md`)

```
## Playtest <n> — <date> — build <git short hash>
Machine: <OS, browser and version, GPU> · Headphones: <yes/no>
1. Where did you feel tense or scared? (times or rooms)
2. Where were you bored or confused?
3. Did anything feel unfair (a death you did not understand)?
4. Controls and feel: anything awkward?
5. Anything broken or cheap-looking or cheap-sounding?
Attached: benchmark file, 2–3 screenshots
```

### 8.8 Verification suite (`npm run verify`)

1. Type check (`tsc --noEmit`) and lint.
2. Unit tests (Vitest): sound propagation, beliefs, utility scoring, inventory, save/load, radio grammar.
3. Scenario tests in the headless browser (Electron): physics (stacking, door drag, throw distance, barricade break), AI (a thrown bottle in room B sends the creature to room B; a hidden player is not found by sight; a repeated lure loses effect), progression (bots finish every objective).
4. Screenshot tour: fixed camera stops per zone, rendered through both the WebGPU and the WebGL2 backends, captured by render-target readback; diffed against baselines with pixelmatch.
5. Budgets: draw calls, triangles, texture memory and CPU frame time read from the engine; fail when above §4.11.
6. Asset checks: ledger coverage, file size limits, KTX2 encoding, LODs.

Real-GPU checks: when the owner's Chrome is connected (Claude in Chrome), an interactive session opens the preview, runs `?bench=1`, reads the console and takes screenshots on the owner's actual GPU.

### 8.9 Git conventions

- `main` always builds and passes verification. Each milestone is tagged (`m0`, `m1`, …).
- Commit message: `<item id>: <imperative summary>`.
- Large binaries: only game-ready assets inside the size budget; raw sources stay on the owner's computer. Shallow clones in sessions.

---

## 9. Milestones and backlog

Run counts are estimates and are re-based after M1 from measured runs per item.

| Milestone | Runs (estimate) | Gate (owner checks) |
| --- | --- | --- |
| M0 Pipeline | 2–4 | Preview runs on your Mac in Chrome and Safari, WebGPU and WebGL2 paths; benchmark file returned (a Windows machine joins when a tester is available, D-008) |
| M1 Core feel | 4–8 | Playtest 1: moving and interacting feel right |
| M2 Greybox level | 4–8 | Bots finish the slice; you review the layout |
| M3 Creature and squad AI | 8–15 | Playtest 2: tense and fair? Sets the final scope |
| M4 Art pass | 10–20 | Your GPU screenshots; benchmark within budget |
| M5 Story and audio | 6–12 | Playtest 3: a full run start to finish |
| M6 Polish and release | 6–12 | Release candidate on both systems |
| **Total** | **40–79** | Roughly 2–4 months at one run a day plus playtest gaps (estimate) |

### M0 Pipeline

- [ ] **M0.1 Scaffold.** Vite + TypeScript + three.js 0.186.1 + Rapier 0.21 + Vitest; scripts `dev`, `build`, `verify`. Port the pipeline-test scene. *Accept:* build succeeds; JavaScript under 2.5 MB gzip; verify runs green.
- [ ] **M0.2 Bootstrap.** `tools/bootstrap.sh` installs every pinned tool in a fresh session (Electron from GitHub release with checksum). *Accept:* completes in a fresh session and prints all versions.
- [ ] **M0.3 Harness.** Electron runners: `shoot` (single frame), `tour` (camera stops), `scenarios`, `bench`; render-target readback; fail on any page error. *Accept:* tour renders through both backends; a planted error fails the run.
- [ ] **M0.4 Lightmap pipeline.** Bake script (Cycles + denoise), UV orientation fix, encoding test (RGBM KTX2 vs HDR KTX2), lightmap debug view. *Accept:* debug view matches the reference; encoded map within 2 MB per 1024²; no visible banding in the tour.
- [ ] **M0.5 Asset routes.** `tools/fetch_assets.py` for the owner's computer; `content/asset_manifest.json` v1 (first 12 materials, 4 HDRIs); ledger and its check. *Accept:* dry run lists files and licences; ledger check passes.
- [ ] **M0.6 Preview channel.** Try a private Claude artifact page first; fall back to Cloudflare Pages. *Accept:* the owner opens the preview on the Mac in Chrome and Safari (Windows when a tester is available, D-008).
- [ ] **M0.7 Benchmark.** `?bench=1`: 60-second camera path; writes average FPS, 1% low, 95th-percentile frame time, draw calls, triangles, backend, GPU string; copy button and file download. *Accept:* the owner returns results from the Mac in Chrome and Safari (Windows when a tester is available, D-008).
- [ ] **M0.8 Memory files.** `CLAUDE.md`, `HANDOFF.md`, `BACKLOG.md` (this backlog), `DECISIONS.md` (D-001 onward), `docs/ASSETS.md`, `CHANGELOG.md`. *Accept:* all present and linked from `CLAUDE.md`.
- [ ] **M0.9 Responsive display (D-008).** Window resize, device pixel ratio, render scale capped per tier, horizontal-FOV camera for any aspect ratio, interface scaling, fullscreen toggle, phone and tablet notice. *Accept:* the tour renders at 1280×720, 1366×768, 1440×900, 1920×1080, 2560×1600 at pixel ratio 2, and 3440×1440 through both backends with no page errors and no stretching; a resize mid-run keeps rendering; a touch-only device profile shows the notice.

### M1 Core feel

- [ ] **M1.1 Input.** Pointer lock, raw mouse, sensitivity, invert, gamepad, remapping, settings persistence. *Accept:* unit tests for mapping; scenario: pointer lock released on Esc opens pause.
- [ ] **M1.2 Character controller.** Walk, sprint with stamina, crouch, lean, stairs and slopes, head-bob toggle, footstep cadence. *Accept:* scenarios for step height, slope limit, crouch under a 1.2 m beam.
- [ ] **M1.3 Flashlight.** As in §8.5.
- [ ] **M1.4 Interaction.** Focus ray, pick up, inspect and rotate, drag via joint, throw by hold time, doors on hinges with hand drag, drawers. *Accept:* scenarios: door opens by drag; throw distance within tuning range; drawers stop at limits.
- [ ] **M1.5 Footsteps and impacts.** Surface detection, sound selection, `SoundEvent` loudness. *Accept:* unit test of the loudness table; event log in debug overlay.
- [ ] **M1.6 Menus and loading.** Title (grants pointer lock and audio), pause, settings, loading progress, quality tier selection. *Accept:* scenario walks every menu; settings persist after reload.
- [ ] **M1.7 Feel Lab.** Test room with every interactable and surface type; first owner build. *Accept:* playtest 1 notes logged.

### M2 Greybox level

- [ ] **M2.1 Layout data.** `content/layout.json` and `content/rooms.json` for L1–L3 (rooms, openings, heights, acoustic tags). *Accept:* validator checks connectivity and opening sizes.
- [ ] **M2.2 Greybox generator.** Blender script builds zone meshes and colliders from layout data. *Accept:* every room reachable in physics; tour per zone.
- [ ] **M2.3 Zone streaming.** Load and unload by portal proximity with budgets. *Accept:* memory stays within budget during a bot run.
- [ ] **M2.4 Navmesh.** Recast bake per zone with door and vent links; debug view. *Accept:* path queries succeed between all rooms.
- [ ] **M2.5 Objective graph.** Keys, power, codes, documents; soft-lock checker (graph search over states). *Accept:* checker proves the slice completable from every checkpoint.
- [ ] **M2.6 Bot player.** Follows navmesh paths through objectives, presses switches, uses doors. *Accept:* completes the slice headless at 4× speed.
- [ ] **M2.7 Greybox bake.** First full-level lightmap bake to measure bake time at scale. *Accept:* bake time and lightmap sizes recorded in `docs/TECH.md`.

### M3 Creature and squad AI

- [ ] **M3.1 Sound propagation** on the room graph with debug overlay. *Accept:* unit tests for door states and distance loss.
- [ ] **M3.2 Light exposure** from lightmap luminance at the player plus dynamic lights. *Accept:* tests: dark corner below threshold, flashlight on above.
- [ ] **M3.3 Perception** (vision cone with raycasts, hearing, suspicion meter). *Accept:* scenarios for seen, unseen-in-shadow, heard-through-door.
- [ ] **M3.4 Beliefs** (last known position, room probabilities, spread and decay). *Accept:* unit tests on spread; overlay heat map in tour.
- [ ] **M3.5 Utility decisions** with visible scores. *Accept:* scenarios produce the expected action for 10 staged situations.
- [ ] **M3.6 Creature locomotion and actions** (navmesh agent, vents, barricade testing). *Accept:* reaches any room; breaks a weak barricade, not a strong one.
- [ ] **M3.7 Learning** (habit counters, lure fatigue). *Accept:* the third identical lure is ignored; favourite hiding spot is checked first.
- [ ] **M3.8 Squad AI** (sweeps, cover, shared knowledge, panic). *Accept:* four-soldier sweep clears a zone without stacking in doorways.
- [ ] **M3.9 Radio intel and spoofing** (grammar, scanner, transmitter, credibility). *Accept:* intercepted messages match squad state in scenarios; a believable spoof redirects the squad, a contradicted one does not.
- [ ] **M3.10 Director** (tension, quiet stretches, fairness rules). *Accept:* 30-minute bot soak shows quiet stretches after every chase and no out-of-view teleports.
- [ ] **M3.11 Scenario suite** of at least 20 AI scenarios and a 30-minute soak with no stuck agents. *Accept:* suite green; playtest 2 notes logged.

### M4 Art pass

- [ ] **M4.1 Art bible** with reference renders and a colour-grading LUT.
- [ ] **M4.2 Modular kit generator** (walls, floors, ceilings, door frames, pipes, cable trays, vents, stairs, railings) with trim-sheet and lightmap UVs. *Accept:* kit snaps on a 0.5 m grid; tour shows no seams.
- [ ] **M4.3 Materials** from scanned sources to KTX2, with grime masks and a wetness layer. *Accept:* every surface uses a ledgered material; texture memory within budget.
- [ ] **M4.4 Props** (procedural consoles, radios, lockers, desks, chairs, cabinets, crates; scanned props) with LODs. *Accept:* draw calls within budget in the densest room.
- [ ] **M4.5 Decals** (grime, stains, blood, signage). *Accept:* no repetition visible in the tour's long corridor stops.
- [ ] **M4.6 Lighting pass** per zone: fixtures, flicker groups, emergency lights, bakes, light probes, reflection cubemaps. *Accept:* per-zone tour approved by owner screenshots.
- [ ] **M4.7 Post and tiers** tuned with the owner's benchmark files. *Accept:* each tier within its frame budget on the owner's machines.
- [ ] **M4.8 Characters** (MakeHuman soldiers with masks and helmets; the creature), Mixamo animations retargeted with three.js `SkeletonUtils.retargetClip`, foot IK, ragdolls. *Accept:* animation test scene renders every clip without foot sliding above tolerance.
- [ ] **M4.9 Particles** (dust motes, drips, steam, sparks). *Accept:* visible in flashlight in the tour; within budget.
- [ ] **M4.10 Performance pass** (instancing, merging, culling, texture streaming). *Accept:* all budgets met; gate screenshots.

### M5 Story and audio

- [ ] **M5.1 Script:** beats, 25 documents, radio grammar, subtitles file ready for translation.
- [ ] **M5.2 Voice:** radio and PA lines synthesised on the owner's PC (§12) or text-only fallback; radio filter chain.
- [ ] **M5.3 Audio engine:** HRTF sources, generated impulse responses per room, occlusion from the room graph, ducking, music stems with tension.
- [ ] **M5.4 Set pieces** (6–8) built from systems: power failure, flooded corridor, squad ambush, silhouette reveal, finale.
- [ ] **M5.5 Journal and deduction board;** spoofing polish.
- [ ] **M5.6 Full-run bot and telemetry** (encounter spacing, death heat map). *Accept:* bot full run; playtest 3 notes logged.

### M6 Polish and release

- [ ] **M6.1 Saves and accessibility** (checkpoints, subtitles options, colour-safe interface, reduced motion, hold or toggle inputs).
- [ ] **M6.2 Loading and caching** (zone preload, compression, service worker, progress). *Accept:* first playable within 60 MB compressed.
- [ ] **M6.3 Browser matrix:** Chrome, Edge, Firefox, Safari on Windows and macOS (owner machines plus Claude in Chrome). *Accept:* matrix recorded in `docs/TECH.md`.
- [ ] **M6.4 Bug bash:** two-hour bot soak; fix top issues.
- [ ] **M6.5 Credits and licences** from the ledger (including "Powered by Poly Haven" if the API was used).
- [ ] **M6.6 itch.io page and build** (≤ 500 MB, ≤ 1,000 files). *Accept:* release candidate approved by the owner.

---

## 10. Risks and mitigations

| Rank | Risk | Why it matters | Mitigation |
| --- | --- | --- | --- |
| 1 | Works but is not scary | Only the owner can judge fear | Playtests at M1, M3, M5; local telemetry |
| 2 | Browser fragmentation | WebGPU is missing on Linux, on older macOS and in some Firefox setups | Every feature has a WebGL2 path; tours run both backends |
| 3 | Download size | Players leave long loads; hosts cap file sizes | Budgets in §4.11; KTX2 and meshopt; zone streaming |
| 4 | Visual ceiling | No GPU in sessions; free art only | Realism playbook order; owner GPU screenshots; Claude in Chrome checks |
| 5 | Memory loss between runs | Each run starts blank | §0 protocol, memory files, tests |
| 6 | Silent stalls | A run waiting for approval does nothing | Automatic approval if allowed; last-run stamp |
| 7 | Storage limits | Large-file bandwidth is 10 GiB a month | Plain git with shallow clones; raw sources off GitHub |
| 8 | Licence problems | An NC or uncredited asset can block release | Ledger and its check |
| 9 | Shader stutter and garbage collection | First-time material use and allocations cause hitches | `compileAsync` during loading; pooling; benchmark 1% lows |
| 10 | Scope creep | "As detailed as possible" invites endless work | Vertical slice first; scope set at the M3 gate |

---

## 11. What the owner does

**Once (about 2–3 hours, estimate):**

- [ ] Tell Claude: your Claude plan; your PC's GPU; your Mac model and macOS version (Safari's WebGPU needs macOS Tahoe 26); the browsers you use.
- [ ] Create a GitHub repository. Public if you want free GitHub Pages; private otherwise (then previews go through the artifact page or Cloudflare Pages).
- [ ] Connect GitHub to Claude with access to that repository. The first step commits this file and `starter_kit.zip` to it; if that run starts in a new conversation, attach both files there.
- [ ] Keep Claude in Chrome installed and connected (§12).
- [ ] After M0.5: run `python tools/fetch_assets.py` once on your computer and push the results; download the Mixamo and sound lists; export MakeHuman bodies with the settings given.
- [ ] Approve the scheduled task; turn on automatic approval if allowed; check the first two runs and your usage bars.
- [ ] At M6: create an itch.io account.

**Each milestone (about 30 minutes):** play the preview, fill the playtest template, run the benchmark, send the file and two or three screenshots.

**Weekly:** check Settings, Usage; answer questions in `HANDOFF.md`.

---

## 12. Models and connectors

**Claude model: stay on Claude Opus 5.5 for build runs.**

- Fable 5.1 sits a tier above Opus, but under your rules it does not fit. On Max it uses limits faster (up to half of the weekly limit). On Pro it runs only on paid credits.
- Use Fable at most for a rare, hard review (an architecture or AI design review) and only on a Max plan.
- If scheduled runs ever let you pick a model, a lighter model such as Sonnet 5.5 for routine items would stretch the budget further (inference: the Help Center says model choice affects usage).

**Connectors:**

| Connector | Status | Why |
| --- | --- | --- |
| GitHub | Required | The repository is the project's memory and the source of every build |
| Claude in Chrome | Strongly recommended | Lets an interactive session open the preview on your real GPU, run the benchmark, read errors and take screenshots |
| Higgsfield, Magnific | Do not use | Credit-based generators; excluded by the free rule |
| Anything else | Not needed | |

**Optional free AI tools on your own PC** (outputs reviewed and ledgered like any asset):

- TRELLIS (MIT) turns a photo into a 3D model; needs an NVIDIA GPU with 16 GB or more.
- Kokoro (Apache-2.0) or Piper (MIT; check each voice's licence) for radio voices.

---

## 13. Sources

Pages and repositories opened on 21 October 2026.

- three.js r186 examples and source: https://github.com/mrdoob/three.js (tag r186)
- web.dev, WebGPU supported in major browsers: https://web.dev/blog/webgpu-supported-major-browsers
- Godot docs, Exporting for the Web: https://github.com/godotengine/godot-docs/blob/master/tutorials/export/exporting_for_web.rst
- itch.io HTML5 docs: https://itch.io/docs/creators/html5
- itch.io payments: https://itch.io/docs/creators/payments
- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- GitHub large-file billing: https://docs.github.com/en/billing/concepts/product-billing/git-lfs
- GitHub repository limits: https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Poly Haven licence: https://polyhaven.com/license
- Poly Haven public API: https://github.com/Poly-Haven/Public-API
- ambientCG licence guide: https://licenseorg.com/guide/3d-assets/ambientcg
- Kenney, Quaternius, Sketchfab licence comparison: https://app.cinevva.com/guides/sketchfab-polyhaven-kenney
- Kenney Starter Kit FPS: https://github.com/KenneyNL/Starter-Kit-FPS
- MakeHuman FAQ: https://static.makehumancommunity.org/oldsite/faq/can_i_sell_models_created_with_makehuman.html
- Mixamo FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Freesound FAQ: https://freesound.org/help/faq/
- Sonniss GDC 2026 bundle: https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/
- TRELLIS: https://github.com/microsoft/TRELLIS
- Kokoro: https://github.com/hexgrad/kokoro
- Piper: https://github.com/rhasspy/piper
- npm registry entries for every package in §2.4 (versions and licence fields)
- Claude Help Center: usage limits https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work ; usage best practices https://support.claude.com/en/articles/9797557-usage-limit-best-practices ; Fable on your plan https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan ; scheduled tasks https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork
