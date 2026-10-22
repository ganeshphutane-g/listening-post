import { describe, expect, it } from 'vitest';
import { horizontalFov, pixelRatioFor, verticalFovFor } from '../../src/render/display';
import { isTouchOnly } from '../../src/core/device';

const MEDIUM = 1920 * 1080;

describe('pixelRatioFor', () => {
  it('uses the device ratio when the buffer fits the tier budget', () => {
    expect(pixelRatioFor(960, 540, 2, 1, MEDIUM)).toBe(2);
    expect(pixelRatioFor(1920, 1080, 1, 1, MEDIUM)).toBe(1);
  });

  it('lowers the ratio so a Retina laptop stays inside the budget', () => {
    const r = pixelRatioFor(1440, 900, 2, 1, MEDIUM);
    expect(1440 * 900 * r * r).toBeCloseTo(MEDIUM, -2);
    expect(r).toBeLessThan(2);
  });

  it('caps very high device ratios at 2 and applies render scale', () => {
    expect(pixelRatioFor(800, 450, 3, 1, MEDIUM)).toBe(2);
    expect(pixelRatioFor(1280, 720, 1, 0.75, MEDIUM)).toBe(0.75);
  });

  it('never drops below the minimum ratio', () => {
    expect(pixelRatioFor(7680, 4320, 1, 1, 921600)).toBe(0.5);
  });
});

describe('verticalFovFor (Hor+ between 4:3 and 21:9)', () => {
  it('keeps the vertical view for common laptop shapes, so wider windows see more', () => {
    for (const aspect of [4 / 3, 3 / 2, 16 / 10, 16 / 9, 21 / 9]) expect(verticalFovFor(aspect, 72)).toBeCloseTo(72, 5);
    expect(horizontalFov(72, 16 / 10)).toBeLessThan(horizontalFov(72, 16 / 9));
  });

  it('keeps the 21:9 horizontal view on wider screens instead of a fisheye', () => {
    const h219 = horizontalFov(72, 64 / 27);
    expect(horizontalFov(verticalFovFor(32 / 9, 72), 32 / 9)).toBeCloseTo(h219, 2);
  });

  it('keeps the 4:3 horizontal view in narrow windows instead of a keyhole', () => {
    const h43 = horizontalFov(72, 4 / 3);
    expect(horizontalFov(verticalFovFor(1, 72), 1)).toBeCloseTo(h43, 2);
  });
});

describe('isTouchOnly', () => {
  it('flags phones and tablets, not laptops or touch-screen laptops', () => {
    expect(isTouchOnly({ anyFinePointer: false, maxTouchPoints: 5 })).toBe(true);
    expect(isTouchOnly({ anyFinePointer: true, maxTouchPoints: 0 })).toBe(false);
    expect(isTouchOnly({ anyFinePointer: true, maxTouchPoints: 10 })).toBe(false);
    expect(isTouchOnly({ anyFinePointer: false, maxTouchPoints: 0 })).toBe(false);
  });
});
