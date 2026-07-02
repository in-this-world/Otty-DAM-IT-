import { expect, test } from '@playwright/test';

/**
 * P0-02 smoke test.
 *
 * Boot contract: BootScene sets `window.__otty = { ready: true }` once the
 * game has finished booting (src/game/scenes/BootScene.ts). This spec waits
 * for that flag, asserts it, and captures a visual baseline of the booted
 * game.
 *
 * Baseline screenshots are stored under tests/e2e/__screenshots__/ (see
 * snapshotPathTemplate in playwright.config.ts), suffixed by platform.
 * First-run semantics: if no baseline exists for the current platform,
 * `npx playwright test --update-snapshots` creates it; commit the generated
 * file. On CI a missing baseline fails the run and uploads the candidate
 * image in the artifacts — download it, review it, and commit it as the
 * linux baseline.
 */

interface OttyGlobal {
  ready?: boolean;
}

test('game boots, exposes __otty.ready, and matches visual baseline', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');

  // Wait for the game's readiness flag rather than sleeping.
  await page.waitForFunction(
    () => (window as unknown as { __otty?: { ready?: boolean } }).__otty?.ready === true,
    undefined,
    { timeout: 15_000 },
  );

  const ready = await page.evaluate(
    () => (window as unknown as { __otty?: OttyGlobal }).__otty?.ready,
  );
  expect(ready).toBe(true);

  // The Phaser canvas must be present and visible once the game is ready.
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // No uncaught errors during boot.
  expect(pageErrors, `uncaught page errors during boot:\n${pageErrors.join('\n')}`).toEqual([]);

  // Give the first rendered frame a beat to settle before the baseline shot.
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('boot-screen.png');
});
