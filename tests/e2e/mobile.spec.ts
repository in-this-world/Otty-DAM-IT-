import { expect, test } from '@playwright/test';

/**
 * P2-06 mobile viewport smoke + visual baseline.
 *
 * Loads the game in a portrait phone viewport with hazards OFF and no AI
 * (deterministic, frozen) and asserts it boots, the canvas is visible and
 * scaled to fit, and window.__otty is the expected shape. The on-screen
 * virtual joystick + action buttons are rendered by MobileControls when the
 * viewport is narrow (< 820px), so this also captures a baseline showing them.
 *
 * (Touch-driving a full win is left to a follow-up; this pins that the mobile
 * layout boots cleanly and stays visually stable.)
 */
interface OttyGlobal {
  ready?: boolean;
  hazards?: unknown;
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('boots and fits in a phone viewport, controls visible, no hazards when disabled', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/?seed=1&freeze=1&ai=0&hazards=0');

  await page.waitForFunction(
    () => (window as unknown as { __otty?: { ready?: boolean } }).__otty?.ready === true,
    undefined,
    { timeout: 15_000 },
  );

  const snap = await page.evaluate(
    () => (window as unknown as { __otty?: OttyGlobal }).__otty,
  );
  expect(snap?.ready).toBe(true);
  expect(snap?.hazards ?? null).toBeNull(); // ?hazards=0 disables them

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  // Phaser FIT-scales the 960x540 stage into the phone width.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(390);

  expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([]);

  await page.waitForTimeout(900);
  await expect(page).toHaveScreenshot('mobile-boot.png');
});
