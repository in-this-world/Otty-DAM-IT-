/** P2-09 tile pipeline: pure gutter-trim measurement on synthetic cells. */
import { describe, expect, it } from 'vitest';
import { TILE_MAP, whiteMargins, type RawImage } from '../../../scripts/lib/tiles';

/** Build a solid-color RGBA image, then paint white gutter bands on edges. */
function image(
  width: number,
  height: number,
  gutters: { left?: number; right?: number; top?: number; bottom?: number } = {},
): RawImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isGutter =
        x < (gutters.left ?? 0) ||
        x >= width - (gutters.right ?? 0) ||
        y < (gutters.top ?? 0) ||
        y >= height - (gutters.bottom ?? 0);
      const i = (y * width + x) * 4;
      // content = mid green, gutter = near-white (like the AI sheet margins)
      data[i] = isGutter ? 246 : 90;
      data[i + 1] = isGutter ? 246 : 160;
      data[i + 2] = isGutter ? 244 : 70;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('whiteMargins (tile gutter trim)', () => {
  it('returns zero margins for a full-bleed cell', () => {
    expect(whiteMargins(image(40, 40))).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it('measures white gutters on each edge', () => {
    const m = whiteMargins(image(60, 40, { left: 3, right: 5, top: 2 }));
    expect(m).toEqual({ left: 3, right: 5, top: 2, bottom: 0 });
  });

  it('light content inside the cell is not treated as a gutter', () => {
    const img = image(40, 40, { left: 4 });
    // a white highlight blob in the middle must not extend the trim
    for (let y = 10; y < 20; y++)
      for (let x = 10; x < 20; x++) {
        const i = (y * 40 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 250;
      }
    expect(whiteMargins(img).left).toBe(4);
    expect(whiteMargins(img).right).toBe(0);
  });

  it('never trims more than a quarter of the cell per side', () => {
    // pathological: half the cell is white — trim must stop at 25%
    const m = whiteMargins(image(40, 40, { left: 20 }));
    expect(m.left).toBeLessThanOrEqual(10);
  });
});

describe('TILE_MAP', () => {
  it('has unique keys and needles', () => {
    const keys = TILE_MAP.map((t) => t.key);
    const needles = TILE_MAP.map((t) => t.needle);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(needles).size).toBe(needles.length);
    for (const k of keys) expect(k).toMatch(/^tile_[a-z]+$/);
  });
});
