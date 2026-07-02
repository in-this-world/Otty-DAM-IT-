import { expect, test } from '@playwright/test';

test('game boots and exposes __otty.ready', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () => (window as unknown as { __otty?: { ready?: boolean } }).__otty?.ready === true,
  );
  expect(await page.evaluate(() => (window as unknown as { __otty: { ready: boolean } }).__otty.ready)).toBe(true);
});
