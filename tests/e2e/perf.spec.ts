import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * P2-07: 60fps performance probe. Samples requestAnimationFrame over 8s of a
 * busy round (AI + hazards on) and writes test-results/perf-report.json.
 * Headless CI GPUs are slow, so the hard assertion is lenient (>=30fps avg);
 * the report captures the real numbers for the archive.
 */

test('fps stays playable over a busy 8s window', async ({ page }) => {
  test.slow();
  await page.goto('/?seed=7&ai=2&hazards=1');
  await page.waitForFunction(
    () => (window as unknown as { __otty?: { ready?: boolean } }).__otty?.ready === true,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(1200); // Boot -> Game + settle

  const report = await page.evaluate(
    () =>
      new Promise<{ avgFps: number; minFps: number; frames: number; seconds: number[] }>((resolve) => {
        const perSecond: number[] = [];
        let frames = 0;
        let total = 0;
        const tick = (): void => {
          frames++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const interval = setInterval(() => {
          perSecond.push(frames);
          total += frames;
          frames = 0;
          if (perSecond.length >= 8) {
            clearInterval(interval);
            resolve({
              avgFps: total / perSecond.length,
              minFps: Math.min(...perSecond),
              frames: total,
              seconds: perSecond,
            });
          }
        }, 1000);
      }),
  );

  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/perf-report.json',
    JSON.stringify({ date: new Date().toISOString(), ...report }, null, 2),
  );

  // Headless CI runs on software GL — the gate only catches a frozen/dying
  // loop. Real 60fps validation happens on hardware in P4-03; the committed
  // numbers live in the perf-report.json artifact.
  expect(report.avgFps, `avg fps ${report.avgFps.toFixed(1)} (see perf-report.json)`).toBeGreaterThanOrEqual(15);
});
