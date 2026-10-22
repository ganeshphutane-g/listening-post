import { describe, expect, it } from 'vitest';
import { frameStats } from '../../src/debug/benchStats';

describe('frameStats', () => {
  it('reports a steady 60 FPS run', () => {
    const s = frameStats(new Array(600).fill(1000 / 60));
    expect(s.avgFps).toBe(60);
    expect(s.low1Fps).toBe(60);
    expect(s.p95Ms).toBeCloseTo(16.67, 2);
    expect(s.seconds).toBe(10);
  });

  it('shows hitches in the 1% low and worst frame, not in the average', () => {
    const d = new Array(1000).fill(1000 / 60);
    for (let i = 0; i < 10; i++) d[i * 100] = 100; // ten 100 ms hitches
    const s = frameStats(d);
    expect(s.avgFps).toBeGreaterThan(50);
    expect(s.low1Fps).toBe(10);
    expect(s.worstMs).toBe(100);
  });

  it('handles an empty run', () => {
    expect(frameStats([]).frames).toBe(0);
  });
});
