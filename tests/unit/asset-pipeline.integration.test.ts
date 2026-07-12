/**
 * Integration-style test for the asset pipeline. Runs the full pipeline on the
 * real Assets/ art ONLY when it exists; skipped otherwise (CI-safe).
 * Covers wave 1 (P0-03 OTTY actions) + wave 2 (P2-08 actions, NPCs, objects).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { runPipeline } from '../../scripts/lib/pipeline';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assetsDir = path.join(repoRoot, 'Assets');
const hasAssets = existsSync(path.join(assetsDir, 'A. 待機 Idle.png'));

// wave 1 (25) + wave 2 actions/NPCs (29) + objects (34) = 88
const EXPECTED_FRAMES = 92; // 88 + 4 obj_decor (P2-09 batch 3)
const EXPECTED_ANIM_KEYS = [
  'bear', 'build', 'carry', 'cone_hat', 'dig', 'dizzy', 'eagle', 'eat',
  'float', 'idle', 'lose', 'pick_stone', 'poke', 'throw', 'walk', 'wash', 'win',
];
const EXPECTED_OBJECT_KEYS = [
  'obj_cone', 'obj_dam', 'obj_decor', 'obj_dirt', 'obj_falling', 'obj_fish',
  'obj_splash', 'obj_star', 'obj_stone', 'obj_wood',
];

describe.skipIf(!hasAssets)('runPipeline on real Assets/', () => {
  let outDir: string;
  beforeAll(() => {
    outDir = mkdtempSync(path.join(tmpdir(), 'otty-atlas-'));
  });
  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('produces a valid RGBA atlas covering all wave-1 + wave-2 art', async () => {
    const result = await runPipeline({ assetsDir, outDir });

    const meta = await sharp(result.atlasPng).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.channels).toBe(4);

    const atlas = JSON.parse(readFileSync(result.atlasJson, 'utf8')) as {
      frames: Record<string, unknown>;
    };
    expect(Object.keys(atlas.frames)).toHaveLength(EXPECTED_FRAMES);
    expect(result.frameTotal).toBe(EXPECTED_FRAMES);

    // --- animations ---
    const anims = JSON.parse(readFileSync(result.animationsJson, 'utf8')) as {
      animations: { key: string; frames: string[] }[];
    };
    expect(anims.animations.map((a) => a.key).sort()).toEqual(EXPECTED_ANIM_KEYS);
    for (const a of anims.animations) {
      for (const frame of a.frames) expect(atlas.frames[frame]).toBeDefined();
    }

    // --- objects (atlas frames only, not animations) ---
    const objs = JSON.parse(readFileSync(result.objectsJson, 'utf8')) as {
      objects: Record<string, string[]>;
    };
    expect(Object.keys(objs.objects).sort()).toEqual(EXPECTED_OBJECT_KEYS);
    // the dam merges Dam-1 + Dam-2 into one 8-frame sequence
    expect(objs.objects['obj_dam']).toHaveLength(8);
    expect(objs.objects['obj_fish']).toHaveLength(4);
    expect(objs.objects['obj_cone']).toHaveLength(1);
    // every object frame exists in the atlas, and none is registered as an animation
    const animKeys = new Set(anims.animations.map((a) => a.key));
    for (const [key, frames] of Object.entries(objs.objects)) {
      expect(animKeys.has(key)).toBe(false);
      for (const frame of frames) expect(atlas.frames[frame]).toBeDefined();
    }
  }, 180_000);
});
