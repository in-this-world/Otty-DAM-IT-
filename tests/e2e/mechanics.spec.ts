import { expect, test } from '@playwright/test';

/**
 * P2-07/14 regression pack for the boss-playtest mechanics (P2-10/12/13).
 * Asserts against the window.__otty read-only snapshot — no pixel parsing.
 */

interface SnapshotItem {
  id: string;
  x: number;
  y: number;
  type: string;
}
interface Otty {
  ready?: boolean;
  phase?: string;
  items?: SnapshotItem[];
  itemsOnGround?: number;
  otters?: Record<string, { x: number; y: number; action: string; carrying: string | null }>;
}

async function boot(page: import('@playwright/test').Page, query: string): Promise<void> {
  await page.goto(query);
  await page.waitForFunction(() => (window as unknown as { __otty?: Otty }).__otty?.ready === true, undefined, {
    timeout: 15_000,
  });
  // Boot -> GameScene handover.
  await page.waitForFunction(
    () => ((window as unknown as { __otty?: Otty }).__otty?.items?.length ?? 0) > 0,
    undefined,
    { timeout: 10_000 },
  );
}

// P2-12: every fish spawns inside the water zone {0,384,384,156}.
test('fish spawn only inside the river', async ({ page }) => {
  await boot(page, '/?seed=1&ai=0&hazards=0');
  const items = await page.evaluate(() => (window as unknown as { __otty?: Otty }).__otty?.items ?? []);
  const fish = items.filter((i) => i.type === 'fish');
  expect(fish.length).toBeGreaterThan(0);
  for (const f of fish) {
    expect(f.x, `${f.id} x`).toBeGreaterThanOrEqual(0);
    expect(f.x, `${f.id} x`).toBeLessThanOrEqual(384);
    expect(f.y, `${f.id} y`).toBeGreaterThanOrEqual(384);
  }
  // and land items stay off the water
  for (const it of items) {
    if (it.type === 'fish') continue;
    const inWater = it.x >= 0 && it.x <= 384 && it.y >= 384;
    expect(inWater, `${it.id} should not be in the river`).toBe(false);
  }
});

// P2-12: free fish drift (deterministically) — positions change over time.
test('fish swim around inside the river', async ({ page }) => {
  await boot(page, '/?seed=1&ai=0&hazards=0');
  const before = await page.evaluate(() => ((window as unknown as { __otty?: Otty }).__otty?.items ?? []).filter((i) => i.type === 'fish'));
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ((window as unknown as { __otty?: Otty }).__otty?.items ?? []).filter((i) => i.type === 'fish'));
  const byId = new Map(after.map((f) => [f.id, f]));
  let moved = 0;
  for (const f of before) {
    const now = byId.get(f.id);
    if (now && (now.x !== f.x || now.y !== f.y)) moved++;
    if (now) expect(now.y).toBeGreaterThanOrEqual(384); // still in the river
  }
  expect(moved).toBeGreaterThan(0);
});

// P2-10: G digs — a dirt item appears at the player's feet.
test('KeyG digs up dirt', async ({ page }) => {
  await boot(page, '/?seed=1&ai=0&hazards=0');
  const dirtBefore = await page.evaluate(
    () => ((window as unknown as { __otty?: Otty }).__otty?.items ?? []).filter((i) => i.type === 'dirt').length,
  );
  await page.locator('canvas').click(); // focus
  await page.keyboard.press('KeyG');
  await page.waitForFunction(
    (n) => ((window as unknown as { __otty?: Otty }).__otty?.items ?? []).filter((i) => i.type === 'dirt').length > n,
    dirtBefore,
    { timeout: 5_000 },
  );
  const dirtAfter = await page.evaluate(
    () => ((window as unknown as { __otty?: Otty }).__otty?.items ?? []).filter((i) => i.type === 'dirt').length,
  );
  expect(dirtAfter).toBe(dirtBefore + 1);
});
