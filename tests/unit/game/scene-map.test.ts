/**
 * P2-09 scene layout: pure placement rules + a contract test against the
 * real pipeline output (tiles.json must match TILE_SHEETS, obj_decor_* must
 * exist in the atlas).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DAM_SITE,
  TILE,
  TILE_SHEETS,
  TILE_SRC_SIZE,
  WATER_RECT,
  buildSceneLayout,
} from '../../../src/game/scene-map';

const WORLD = { width: 960, height: 540 };

describe('buildSceneLayout', () => {
  const layout = buildSceneLayout(WORLD);

  it('is deterministic', () => {
    expect(buildSceneLayout(WORLD)).toEqual(layout);
  });

  it('references only declared tile textures and valid frames', () => {
    for (const t of [...layout.tiles, ...layout.animatedWater]) {
      const sheet = TILE_SHEETS[t.texture];
      expect(sheet, t.texture).toBeDefined();
      expect(t.frame).toBeGreaterThanOrEqual(0);
      expect(t.frame).toBeLessThan(sheet.frames);
    }
  });

  it('covers the whole world with ground tiles (no gaps)', () => {
    const cells = new Set(
      [...layout.tiles, ...layout.animatedWater]
        .filter((t) => t.size === TILE)
        .map((t) => `${(t.x - TILE / 2) / TILE},${(t.y - TILE / 2) / TILE}`),
    );
    for (let row = 0; row < Math.ceil(WORLD.height / TILE); row++) {
      for (let col = 0; col < Math.ceil(WORLD.width / TILE); col++) {
        expect(cells.has(`${col},${row}`), `cell ${col},${row}`).toBe(true);
      }
    }
  });

  it('animated water cells sit strictly inside the water rect', () => {
    expect(layout.animatedWater.length).toBeGreaterThan(0);
    for (const t of layout.animatedWater) {
      expect(t.texture).toBe('tile_water');
      expect(t.x).toBeGreaterThan(WATER_RECT.x);
      expect(t.x).toBeLessThan(WATER_RECT.x + WATER_RECT.width);
      expect(t.y).toBeGreaterThan(WATER_RECT.y);
    }
  });

  it('bank tiles edge the water zone; no grass inside it', () => {
    for (const t of layout.tiles) {
      if (t.size !== TILE) continue;
      const inWater =
        t.x > WATER_RECT.x &&
        t.x < WATER_RECT.x + WATER_RECT.width &&
        t.y > WATER_RECT.y;
      if (inWater) expect(t.texture, `tile at ${t.x},${t.y}`).toBe('tile_bank');
      else expect(t.texture === 'tile_grass' || t.texture === 'tile_forest').toBe(true);
    }
  });

  it('water rect is tile-grid aligned (gameplay bounds match the art)', () => {
    expect(WATER_RECT.x % TILE).toBe(0);
    expect(WATER_RECT.y % TILE).toBe(0);
    expect(WATER_RECT.width % TILE).toBe(0);
  });

  it('places a riverbed ford under the dam site and keeps the dam span forest-free', () => {
    const ford = layout.tiles.find((t) => t.texture === 'tile_riverbed');
    expect(ford).toBeDefined();
    expect(Math.abs(ford!.x - DAM_SITE.x)).toBeLessThan(TILE);
    for (const t of layout.tiles.filter((t) => t.texture === 'tile_forest')) {
      expect(Math.abs(t.x - DAM_SITE.x)).toBeGreaterThan(160);
    }
  });

  it('decor uses obj_decor frames, clear of the dam approach', () => {
    expect(layout.decor.length).toBeGreaterThan(0);
    for (const d of layout.decor) {
      expect(d.frame).toMatch(/^obj_decor_\d+$/);
      const nearDam =
        Math.abs(d.x - DAM_SITE.x) < 140 && Math.abs(d.y - DAM_SITE.y) < 120;
      expect(nearDam, `decor at ${d.x},${d.y}`).toBe(false);
    }
  });
});

const TILES_JSON = join(__dirname, '../../../public/assets/tiles.json');
const ATLAS = join(__dirname, '../../../public/assets/otter.json');

describe.skipIf(!existsSync(TILES_JSON))('contract: pipeline tile output matches scene-map', () => {
  it('every declared sheet exists with the declared frame count and size', () => {
    const manifest = JSON.parse(readFileSync(TILES_JSON, 'utf8')) as {
      tileSize: number;
      tiles: Record<string, { frames: number; size: number }>;
    };
    expect(manifest.tileSize).toBe(TILE_SRC_SIZE);
    for (const [key, sheet] of Object.entries(TILE_SHEETS)) {
      expect(manifest.tiles[key], key).toBeDefined();
      expect(manifest.tiles[key]!.frames).toBe(sheet.frames);
      expect(manifest.tiles[key]!.size).toBe(TILE_SRC_SIZE);
    }
  });

  it('every strip PNG is on disk', () => {
    for (const key of Object.keys(TILE_SHEETS)) {
      expect(existsSync(join(__dirname, `../../../public/assets/tiles/${key}.png`)), key).toBe(true);
    }
  });
});

describe.skipIf(!existsSync(ATLAS))('contract: decor frames exist in the otter atlas', () => {
  it('obj_decor frames referenced by the layout are in the atlas', () => {
    const atlas = JSON.parse(readFileSync(ATLAS, 'utf8')) as { frames: Record<string, unknown> };
    for (const d of buildSceneLayout(WORLD).decor) {
      expect(atlas.frames[d.frame], d.frame).toBeDefined();
    }
  });
});
