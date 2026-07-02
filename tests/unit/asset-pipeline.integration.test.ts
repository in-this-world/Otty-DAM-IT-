/**
 * Integration-style test for the P0-03 pipeline. Runs the full pipeline on the
 * real Assets/ art ONLY when it exists; skipped otherwise (CI-safe).
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

describe.skipIf(!hasAssets)('runPipeline on real Assets/', () => {
  let outDir: string;
  beforeAll(() => {
    outDir = mkdtempSync(path.join(tmpdir(), 'otty-atlas-'));
  });
  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('produces a valid RGBA atlas + JSON for all 7 animations', async () => {
    const result = await runPipeline({ assetsDir, outDir });

    const meta = await sharp(result.atlasPng).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.channels).toBe(4);

    const atlas = JSON.parse(readFileSync(result.atlasJson, 'utf8')) as {
      frames: Record<string, unknown>;
    };
    // 4+4+4+3+3+4+3 = 25 frames
    expect(Object.keys(atlas.frames)).toHaveLength(25);

    const anims = JSON.parse(readFileSync(result.animationsJson, 'utf8')) as {
      animations: { key: string; frames: string[] }[];
    };
    const keys = anims.animations.map((a) => a.key).sort();
    expect(keys).toEqual(['build', 'carry', 'eat', 'float', 'idle', 'poke', 'walk']);

    // every animation frame exists in the atlas
    for (const a of anims.animations) {
      for (const frame of a.frames) expect(atlas.frames[frame]).toBeDefined();
    }
  }, 120_000);
});
