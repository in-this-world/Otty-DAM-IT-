/**
 * P1-07 acceptance: HUD values match window.__otty (CLAUDE.md rule 5).
 * NOTE: not yet executed in the dev sandbox (no browsers) — first run
 * happens in CI or locally; see Docs/P0-02_P0-05_summary.md.
 */
import { expect, test } from '@playwright/test';

interface Otty {
  ready: boolean;
  phase: string;
  timerMs: number;
  tick: number;
  dam: { progress: number; required: number };
}

declare global {
  interface Window {
    __otty?: Otty;
  }
}

test('game round starts and __otty exposes a live, consistent sim state', async ({ page }) => {
  await page.goto('/?ai=0&hazards=0');
  // Boot -> Game handoff
  await page.waitForFunction(() => window.__otty?.ready === true, undefined, { timeout: 15_000 });
  await page.waitForFunction(() => (window.__otty?.tick ?? 0) > 0, undefined, {
    timeout: 15_000,
  });

  const first = await page.evaluate(() => window.__otty!);
  expect(first.phase).toBe('playing');
  expect(first.dam.required).toBeGreaterThan(0);
  expect(first.dam.progress).toBe(0);
  expect(first.timerMs).toBeGreaterThan(0);
  expect(first.timerMs).toBeLessThanOrEqual(180_000);

  // the sim ticks forward and the countdown falls
  await page.waitForTimeout(1_200);
  const later = await page.evaluate(() => window.__otty!);
  expect(later.tick).toBeGreaterThan(first.tick);
  expect(later.timerMs).toBeLessThan(first.timerMs);
});

test('keyboard input reaches the core (otter moves right)', async ({ page }) => {
  await page.goto('/?ai=0&hazards=0');
  await page.waitForFunction(() => (window.__otty as Otty | undefined)?.ready === true);
  await page.waitForFunction(() => ((window.__otty as Otty | undefined)?.tick ?? 0) > 0);

  const before = await page.evaluate(
    () => (window.__otty as unknown as { otters: Record<string, { x: number }> }).otters,
  );
  const id = Object.keys(before)[0]!;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  const after = await page.evaluate(
    () => (window.__otty as unknown as { otters: Record<string, { x: number }> }).otters,
  );
  expect(after[id]!.x).toBeGreaterThan(before[id]!.x);
});
