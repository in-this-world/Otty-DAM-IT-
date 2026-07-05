/**
 * P0-03 asset pipeline unit tests.
 * These tests generate small synthetic RGB images with sharp at runtime;
 * they must NOT depend on the real Assets/ art files.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

import { detectGrid } from '../../scripts/lib/grid';
import {
  applyColorKey,
  floodKeyBackground,
  sampleBackgroundColor,
  type RawRGBA,
} from '../../scripts/lib/colorkey';
import { buildPhaserAtlasJson, packFrames } from '../../scripts/lib/atlas';
import { buildAnimationsManifest } from '../../scripts/lib/animations';
import { processSheet } from '../../scripts/lib/pipeline';

/** Build a synthetic RGB (no alpha) sprite sheet: light-gray bg, one solid
 *  red square centered in each square cell. Returns a PNG buffer. */
async function syntheticSheetPng(cells: number, cellSize: number): Promise<Buffer> {
  const bg = { r: 238, g: 238, b: 236 };
  const square = Math.floor(cellSize / 2);
  const composites = [];
  for (let i = 0; i < cells; i++) {
    composites.push({
      input: {
        create: {
          width: square,
          height: square,
          channels: 3 as const,
          background: { r: 200, g: 30, b: 30 },
        },
      },
      left: i * cellSize + Math.floor((cellSize - square) / 2),
      top: Math.floor((cellSize - square) / 2),
    });
  }
  return sharp({
    create: { width: cells * cellSize, height: cellSize, channels: 3, background: bg },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function toRaw(png: Buffer): Promise<RawRGBA> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

describe('detectGrid', () => {
  it('detects 4 square frames in a 2508x627 sheet', () => {
    expect(detectGrid(2508, 627)).toEqual({ frameCount: 4, frameSize: 627 });
  });

  it('detects 3 square frames in a 2172x724 sheet', () => {
    expect(detectGrid(2172, 724)).toEqual({ frameCount: 3, frameSize: 724 });
  });

  it('rejects sheets whose width is not a multiple of height', () => {
    expect(() => detectGrid(2500, 627)).toThrow(/square/i);
  });

  it('rejects non-positive dimensions', () => {
    expect(() => detectGrid(0, 0)).toThrow();
  });
});

describe('sampleBackgroundColor', () => {
  it('samples the light-gray background from the corners', async () => {
    const img = await toRaw(await syntheticSheetPng(3, 20));
    const bg = sampleBackgroundColor(img);
    expect(Math.abs(bg.r - 238)).toBeLessThanOrEqual(2);
    expect(Math.abs(bg.g - 238)).toBeLessThanOrEqual(2);
    expect(Math.abs(bg.b - 236)).toBeLessThanOrEqual(2);
  });
});

describe('applyColorKey', () => {
  it('makes background transparent and keeps subject opaque', async () => {
    const img = await toRaw(await syntheticSheetPng(1, 20));
    const keyed = applyColorKey(img, sampleBackgroundColor(img), { tolerance: 24, feather: 32 });

    const alphaAt = (x: number, y: number) => keyed.data[(y * keyed.width + x) * 4 + 3];
    // all four corners transparent
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(19, 0)).toBe(0);
    expect(alphaAt(0, 19)).toBe(0);
    expect(alphaAt(19, 19)).toBe(0);
    // center of the red square fully opaque
    expect(alphaAt(10, 10)).toBe(255);
    // RGB untouched at center
    expect(keyed.data[(10 * 20 + 10) * 4]).toBe(200);
  });

  it('does not mutate the input image', async () => {
    const img = await toRaw(await syntheticSheetPng(1, 8));
    const before = Array.from(img.data);
    applyColorKey(img, sampleBackgroundColor(img), {});
    expect(Array.from(img.data)).toEqual(before);
  });
});

describe('packFrames', () => {
  const frames = Array.from({ length: 25 }, (_, i) => ({
    name: `f_${i}`,
    width: 128,
    height: 128,
  }));

  it('places every frame inside the atlas bounds without overlap', () => {
    const layout = packFrames(frames, { maxWidth: 1024, padding: 2 });
    expect(layout.placements).toHaveLength(25);
    for (const p of layout.placements) {
      expect(p.x + p.width).toBeLessThanOrEqual(layout.width);
      expect(p.y + p.height).toBeLessThanOrEqual(layout.height);
    }
    // pairwise no-overlap
    for (let i = 0; i < layout.placements.length; i++) {
      for (let j = i + 1; j < layout.placements.length; j++) {
        const a = layout.placements[i]!;
        const b = layout.placements[j]!;
        const separated =
          a.x + a.width <= b.x || b.x + b.width <= a.x ||
          a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(separated).toBe(true);
      }
    }
  });

  it('respects maxWidth', () => {
    const layout = packFrames(frames, { maxWidth: 300, padding: 0 });
    expect(layout.width).toBeLessThanOrEqual(300);
  });
});

describe('buildPhaserAtlasJson', () => {
  it('emits a Phaser 3 hash atlas whose entries match the layout', () => {
    const layout = packFrames(
      [
        { name: 'idle_0', width: 128, height: 128 },
        { name: 'idle_1', width: 128, height: 128 },
      ],
      { maxWidth: 512, padding: 2 },
    );
    const atlas = buildPhaserAtlasJson(layout, 'otter.png');
    expect(atlas.meta.image).toBe('otter.png');
    expect(atlas.meta.size).toEqual({ w: layout.width, h: layout.height });
    for (const p of layout.placements) {
      const entry = atlas.frames[p.name];
      expect(entry).toBeDefined();
      expect(entry!.frame).toEqual({ x: p.x, y: p.y, w: p.width, h: p.height });
      expect(entry!.sourceSize).toEqual({ w: p.width, h: p.height });
      expect(entry!.rotated).toBe(false);
      expect(entry!.trimmed).toBe(false);
    }
  });
});

describe('buildAnimationsManifest', () => {
  it('emits keys, frame names, frameRate and repeat flags', () => {
    const manifest = buildAnimationsManifest(
      { idle: 4, walk: 4, carry: 4, poke: 3, eat: 3, float: 4, build: 3 },
      8,
    );
    const byKey = Object.fromEntries(manifest.animations.map((a) => [a.key, a]));
    expect(Object.keys(byKey).sort()).toEqual(
      ['build', 'carry', 'eat', 'float', 'idle', 'poke', 'walk'],
    );
    expect(byKey['idle']!.frames).toEqual(['idle_0', 'idle_1', 'idle_2', 'idle_3']);
    expect(byKey['poke']!.frames).toEqual(['poke_0', 'poke_1', 'poke_2']);
    for (const a of manifest.animations) expect(a.frameRate).toBe(8);
    // loops
    for (const key of ['idle', 'walk', 'carry', 'float', 'build']) {
      expect(byKey[key]!.repeat).toBe(-1);
    }
    // one-shots
    for (const key of ['poke', 'eat']) {
      expect(byKey[key]!.repeat).toBe(0);
    }
  });
});

describe('processSheet', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'otty-sheet-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('slices, keys and resizes a synthetic 3-frame sheet', async () => {
    const file = path.join(dir, 'synthetic.png');
    writeFileSync(file, await syntheticSheetPng(3, 40));

    const frames = await processSheet(file, 'test', {
      frameHeight: 16,
      tolerance: 24,
      feather: 32,
    });

    expect(frames).toHaveLength(3);
    for (const [i, f] of frames.entries()) {
      expect(f.name).toBe(`test_${i}`);
      expect(f.width).toBe(16);
      expect(f.height).toBe(16);
      expect(f.data.length).toBe(16 * 16 * 4); // RGBA
      const alphaAt = (x: number, y: number) => f.data[(y * 16 + x) * 4 + 3]!;
      // corners transparent, center opaque
      expect(alphaAt(0, 0)).toBe(0);
      expect(alphaAt(15, 15)).toBe(0);
      expect(alphaAt(8, 8)).toBeGreaterThan(200);
    }
  });
});

describe('floodKeyBackground (border-connected removal)', () => {
  const W = 24;
  const H = 24;
  const bg = { r: 238, g: 238, b: 236 };
  // Build a raw RGBA image: gray bg everywhere, a dark outline ring enclosing
  // an interior that is ALSO the bg gray color (e.g. a gray stone / white belly).
  function stoneImage(): RawRGBA {
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const onRing = x >= 6 && x <= 17 && y >= 6 && y <= 17 &&
          (x === 6 || x === 17 || y === 6 || y === 17);
        const r = onRing ? 40 : bg.r;
        const g = onRing ? 40 : bg.g;
        const b = onRing ? 40 : bg.b;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    return { data, width: W, height: H };
  }

  const alphaAt = (img: RawRGBA, x: number, y: number) => img.data[(y * W + x) * 4 + 3]!;

  it('keeps a bg-colored interior enclosed by an outline (unlike global key)', () => {
    const img = stoneImage();
    const flooded = floodKeyBackground(img, bg, { tolerance: 24, feather: 20 });
    // corners (outside the ring) become transparent
    expect(alphaAt(flooded, 0, 0)).toBe(0);
    expect(alphaAt(flooded, 23, 23)).toBe(0);
    // interior gray (x12,y12) stays opaque because it is unreachable from border
    expect(alphaAt(flooded, 12, 12)).toBe(255);
    // the dark outline itself stays opaque
    expect(alphaAt(flooded, 6, 12)).toBe(255);

    // contrast: the global color-key erases the interior too (the bug we avoid)
    const global = applyColorKey(img, bg, { tolerance: 24, feather: 20 });
    expect(alphaAt(global, 12, 12)).toBe(0);
  });

  it('does not mutate the input image', () => {
    const img = stoneImage();
    const before = Array.from(img.data);
    floodKeyBackground(img, bg, {});
    expect(Array.from(img.data)).toEqual(before);
  });
});
