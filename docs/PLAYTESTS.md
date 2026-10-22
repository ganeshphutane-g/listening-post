# Playtests

Template: MASTER_PLAN §8.7. Newest at the bottom.

## How to run playtest 1 (M1.7)

1. Open https://ganeshphutane-g.github.io/listening-post/?lab=1 in Chrome, then in Safari. Use headphones if you have them (no sound plays yet; the sound-event log at top right shows what the creature will hear).
2. Press Play. Walk across every floor strip, climb the stairs and the 30° ramp, try the 50° ramp (you should slide back), crouch under the red beam (C), lean at a wall (Q/E), sprint until you run out of breath (Shift).
3. Hold the left mouse on a bottle, a box, the stool and the crate: the light ones lift, the crate only drags. Hold the right mouse while carrying to throw.
4. Walk the door open while holding the left mouse on it; pull the two drawers out and push them back.
5. Press F a few times; Esc for the pause menu; open Settings and try sensitivity, field of view, head-bob off, and rebinding a key.
6. Then open the corridor (the address without `?lab=1`) and run `?bench=1` once in each browser.
7. Copy the template below, fill it in, and send it (or paste it into this file).

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

## Playtest 1 — 2026-10-22 — builds 6c94df3 → c850d19 (run by Claude on the owner's Mac, at the owner's request)
Machine: MacBook Air M1 8 GB, macOS 26.5.1; Chrome 155 (WebGPU and WebGL2), Safari 26.5 (WebGPU and WebGL2) · Headphones: n/a (no audio yet)

How: Chrome was driven through the Claude in Chrome extension (real clicks, key and mouse events) on the live preview; Chrome would not grant pointer lock to an automated click, so the Feel Lab was played with `?nolock=1`. Safari could not be scripted (no Screen Recording permission, no Apple-event JavaScript), so it ran the benchmark and the full in-browser self-test (`?harness=1&report=1`) against a localhost build of the same commit and posted the results to `tools/harness/bench_server.mjs`. Benchmark and self-test files are in `docs/bench/`.

1. Where did you feel tense or scared? — Not judged: this needs the owner. Nothing in the Feel Lab is meant to be scary yet.
2. Where were you bored or confused? — The Feel Lab labels make every station clear. The corridor has nothing to do yet beyond walking and dragging crates.
3. Did anything feel unfair? — No deaths exist yet.
4. Controls and feel:
   - Walking, sprinting (stamina runs out), crouching, stairs, the 30° ramp, refusing the 50° ramp and crouching under the 1.2 m beam all work; footsteps change with each floor (concrete 54 dB, metal 60, wood 56, tile, linoleum 51, water 47 crouched) and with gait (sprint 64, crouch 42–43 on tile).
   - Bottles lift and throw (two soft 43–45 dB clinks on tile); the 25 kg crate only drags, as tuned.
   - **Bug found and fixed:** a held door did not open when walked into, because the body stops at the door and the hand point barely moved. Doors now turn by how far the hand pushes along their swing, and movement the door blocks counts as push (`185c673`, `c850d19`); confirmed in Chrome by walking through the doorway.
   - **Bug found and fixed:** when the browser refuses mouse capture, the title screen did nothing and said nothing; it now explains and asks for another click (`210829a`).
   - Pause on Esc and Resume work; the game pauses on its own when Chrome's window is covered (correct, §4.10).
   - Doors may now open too readily (fully open in about a second of pressing forward): the owner should judge.
5. Broken, cheap-looking or cheap-sounding:
   - **Performance:** at the Mac's full window on Retina the game renders about 2 MP (Medium budget) and does not hold 60 FPS: WebGPU 49 FPS (Chrome) and 43 FPS (Safari) average, 1% lows around 25 FPS; WebGL2 31 and 27 FPS. In the lighter Feel Lab it held about 60 FPS. The Medium tier budget or the post effects (SSR, volumetric fog, bloom) need tuning for the M1 (M4.7), and WebGL2 needs a lighter default.
   - **Benchmark bug found and fixed:** Chrome froze a run for 30 s while its window was covered without reporting a hidden tab; the benchmark now restarts its measurement after any pause longer than 500 ms (`6c94df3`).
   - Safari self-test: 12/12 scenarios on both backends, frames render, no errors.

Still for the owner: questions 1 and 4 (tension and feel) need a human; 10 minutes in the Feel Lab with `?lab=1` and a real mouse is enough.

