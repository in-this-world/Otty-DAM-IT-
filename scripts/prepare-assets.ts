/**
 * P0-03 asset pipeline entry point (`npm run assets`).
 * Reads the A..G sprite strips from Assets/ and writes the packed atlas
 * (otter.png + otter.json) and animations.json to public/assets/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPipeline } from './lib/pipeline';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const result = await runPipeline({
    assetsDir: path.join(repoRoot, 'Assets'),
    outDir: path.join(repoRoot, 'public', 'assets'),
  });

  console.log(
    `atlas: ${result.atlasSize.width}x${result.atlasSize.height}, ${result.frameTotal} frames`,
  );
  let total = 0;
  for (const [file, size] of Object.entries(result.bytes)) {
    console.log(`  ${file}: ${(size / 1024).toFixed(1)} KB`);
    total += size;
  }
  console.log(`total: ${(total / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error('[prepare-assets] failed:', err);
  process.exitCode = 1;
});
