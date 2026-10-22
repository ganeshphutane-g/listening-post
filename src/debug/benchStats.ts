// Frame-time statistics for the benchmark (MASTER_PLAN §9 M0.7). Pure, so it is unit-tested.
export interface FrameStats { frames: number; seconds: number; avgFps: number; low1Fps: number; p95Ms: number; worstMs: number }

/** `deltas` are frame-to-frame times in milliseconds. 1% low = the frame rate of the slowest 1% of frames. */
export function frameStats(deltas: number[]): FrameStats {
  if (deltas.length === 0) return { frames: 0, seconds: 0, avgFps: 0, low1Fps: 0, p95Ms: 0, worstMs: 0 };
  const total = deltas.reduce((a, b) => a + b, 0);
  const sorted = [...deltas].sort((a, b) => a - b);
  const worst = sorted.slice(Math.floor(sorted.length * 0.99));
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const r = (x: number, d = 1) => +x.toFixed(d);
  return {
    frames: deltas.length, seconds: r(total / 1000), avgFps: r((deltas.length * 1000) / total),
    low1Fps: r(1000 / worstAvg), p95Ms: r(p95, 2), worstMs: r(sorted[sorted.length - 1], 2),
  };
}
