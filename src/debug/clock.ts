// Test clock (MASTER_PLAN §4.3 "a test clock"). three.js reads time only through performance.now()
// (NodeFrame → TSL `time`, which drives film grain and fog drift), so in harness mode a fake clock
// makes every frame reproducible. Imported first by main.ts so it is in place before any render.
export const realNow = performance.now.bind(performance);
export const HARNESS = new URLSearchParams(location.search).has('harness');

let fake = 0;
if (HARNESS) performance.now = () => fake;

/** Move the fake clock forward. No-op outside harness mode. */
export function advanceClock(ms: number): void {
  fake += ms;
}
