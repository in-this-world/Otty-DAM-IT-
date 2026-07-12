/**
 * P1-08 acceptance: one complete round each way.
 *
 *  - WIN:  a keyboard bot (driven purely by the window.__otty snapshot,
 *          CLAUDE.md rule 5) ferries branches to the dam until progress
 *          reaches `required`, using the ?required=3&timer=120000 hooks
 *          to keep the round short and un-losable within the budget.
 *  - LOSE: ?timer=3000 and hands off the keyboard; the flood arrives.
 *
 * Bot strategy: a 100ms poll loop re-reads __otty each iteration and
 * steers with ONE held arrow key at a time — the one that reduces the
 * larger axis delta (matches src/game/input.ts, where the active held
 * direction wins). Because every decision is recomputed from fresh state,
 * overshoot at the world bounds self-corrects on the next poll. Near a
 * branch it presses E and confirms via `carrying`; near the dam site it
 * presses B and confirms via the branch being consumed (or the win).
 *
 * NOTE: not yet executed in the dev sandbox (no browsers) — first run
 * happens in CI or locally via `npm run e2e`.
 */
import { expect, test, type Page } from '@playwright/test';

/* ------------------------- __otty typing (local) ------------------------ */
// hud.spec.ts already `declare global`s a narrower Window.__otty, so this
// file uses explicit casts instead of augmenting Window again.

interface OttyOtter {
  x: number;
  y: number;
  action: string;
  carrying: string | null;
}

interface OttyItem {
  id: string;
  x: number;
  y: number;
  type: string;
}

interface Otty {
  ready: boolean;
  tick: number;
  phase: string;
  timerMs: number;
  dam: { progress: number; required: number };
  otters: Record<string, OttyOtter>;
  itemsOnGround: number;
  items: OttyItem[];
}

function readOtty(page: Page): Promise<Otty> {
  return page.evaluate(() => {
    const snapshot = (window as unknown as { __otty?: unknown }).__otty;
    if (!snapshot) throw new Error('__otty not published yet');
    return snapshot as never;
  });
}

async function waitForRoundStart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __otty?: { ready?: boolean } }).__otty?.ready === true,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForFunction(
    () => ((window as unknown as { __otty?: { tick?: number } }).__otty?.tick ?? 0) > 0,
    undefined,
    { timeout: 15_000 },
  );
}

/* --------------------------------- bot --------------------------------- */

const PLAYER_ID = 'otter-1';
const DAM_SITE = { x: 480, y: 96 };
/** Core PICKUP_RADIUS is 48; trigger early to absorb one poll of drift. */
const PICKUP_TRIGGER = 28;
/** P2-12: the build check is now a RECT (±120 x, ±56 y around the site).
 *  Arrive well inside it from any approach direction. */
const BUILD_TRIGGER = 40;
const POLL_MS = 100;
/** Wall-clock budget for the whole ferry loop (test timeout is 120s). */
const BOT_BUDGET_MS = 90_000;

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Holds at most one arrow key. Each `step` re-decides from fresh state:
 * pick the axis with the larger remaining delta, hold its arrow, release
 * everything once inside `arriveRadius`. Returns true when arrived.
 */
class Steering {
  private held: ArrowKey | null = null;

  constructor(private readonly page: Page) {}

  async step(
    pos: { x: number; y: number },
    target: { x: number; y: number },
    arriveRadius: number,
  ): Promise<boolean> {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    if (Math.hypot(dx, dy) <= arriveRadius) {
      await this.stop();
      return true;
    }
    const desired: ArrowKey =
      Math.abs(dx) >= Math.abs(dy)
        ? dx > 0
          ? 'ArrowRight'
          : 'ArrowLeft'
        : dy > 0
          ? 'ArrowDown'
          : 'ArrowUp';
    if (desired !== this.held) {
      // input.ts keeps the currently-held direction active, so the old key
      // must be released before the new one can take over.
      await this.stop();
      await this.page.keyboard.down(desired);
      this.held = desired;
    }
    return false;
  }

  async stop(): Promise<void> {
    if (this.held !== null) {
      await this.page.keyboard.up(this.held);
      this.held = null;
    }
  }
}

/** Only these can be delivered to the dam (P2-01); fish would soft-lock the bot. */
const BUILD_MATERIALS = new Set(['branch', 'stone']);

function nearestItem(pos: { x: number; y: number }, items: readonly OttyItem[]): OttyItem | null {
  let best: OttyItem | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (!BUILD_MATERIALS.has(item.type)) continue;
    const d = Math.hypot(item.x - pos.x, item.y - pos.y);
    if (d < bestDist) {
      best = item;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Short confirmation polls after a keypress. Timeouts are swallowed on
 * purpose: a missed pickup/build just makes the outer loop re-read state
 * and try again, which is what keeps the bot self-correcting.
 */
function confirmPickedUp(page: Page): Promise<void> {
  return page
    .waitForFunction(
      () => {
        const otty = (window as unknown as { __otty?: Otty }).__otty;
        return (otty?.otters['otter-1']?.carrying ?? null) !== null;
      },
      undefined,
      { timeout: 1_500 },
    )
    .then(() => undefined)
    .catch(() => undefined);
}

function confirmBuilt(page: Page): Promise<void> {
  return page
    .waitForFunction(
      () => {
        const otty = (window as unknown as { __otty?: Otty }).__otty;
        if (!otty) return false;
        // build consumes the branch; on the final delivery the phase flips
        return otty.phase === 'won' || otty.otters['otter-1']?.carrying === null;
      },
      undefined,
      { timeout: 1_500 },
    )
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * Ferry branches until dam.progress >= dam.required. Every iteration
 * re-reads __otty, so mispredictions (overshoot, missed pickup, clamped
 * movement at the world bounds) self-correct on the next poll.
 */
async function playUntilWon(page: Page): Promise<Otty> {
  const steer = new Steering(page);
  const deadline = Date.now() + BOT_BUDGET_MS;

  try {
    while (Date.now() < deadline) {
      const otty = await readOtty(page);
      if (otty.phase === 'won') return otty;
      if (otty.phase !== 'playing') {
        throw new Error(`round ended in unexpected phase "${otty.phase}"`);
      }
      const me = otty.otters[PLAYER_ID];
      if (!me) throw new Error(`snapshot has no otter "${PLAYER_ID}"`);

      if (me.carrying === null) {
        const target = nearestItem(me, otty.items);
        if (!target) throw new Error('no build materials left on the ground but dam not finished');
        if (await steer.step(me, target, PICKUP_TRIGGER)) {
          await page.keyboard.press('KeyE');
          await confirmPickedUp(page);
        }
      } else if (await steer.step(me, DAM_SITE, BUILD_TRIGGER)) {
        await page.keyboard.press('KeyB');
        await confirmBuilt(page);
      }
      await page.waitForTimeout(POLL_MS);
    }
  } finally {
    await steer.stop();
  }
  throw new Error(`bot budget (${BOT_BUDGET_MS}ms) exhausted before winning`);
}

/* --------------------------------- specs -------------------------------- */

test.describe('P1-08 full round', () => {
  test('WIN: bot ferries branches until the dam is complete', async ({ page }) => {
    test.setTimeout(120_000);

    // seed=1: deterministic layout; required=3: 3 deliveries to win;
    // timer=120000: cannot lose within the bot budget.
    await page.goto('/?seed=1&required=3&timer=120000&ai=0&hazards=0');
    await waitForRoundStart(page);

    const opening = await readOtty(page);
    expect(opening.phase).toBe('playing');
    expect(opening.dam.required).toBe(3);
    expect(opening.dam.progress).toBe(0);
    expect(opening.items.length).toBeGreaterThan(0);

    await playUntilWon(page);

    // settle one snapshot after the win event
    await page.waitForFunction(
      () => (window as unknown as { __otty?: { phase?: string } }).__otty?.phase === 'won',
      undefined,
      { timeout: 5_000 },
    );
    const final = await readOtty(page);
    expect(final.phase).toBe('won');
    expect(final.dam.progress).toBeGreaterThanOrEqual(final.dam.required);
    expect(final.timerMs).toBeGreaterThan(0);
  });

  test('LOSE: untouched round floods when the timer expires', async ({ page }) => {
    await page.goto('/?seed=1&timer=3000&ai=0&hazards=0');
    await waitForRoundStart(page);

    await page.waitForFunction(
      () => (window as unknown as { __otty?: { phase?: string } }).__otty?.phase === 'lost',
      undefined,
      { timeout: 20_000 },
    );

    const final = await readOtty(page);
    expect(final.phase).toBe('lost');
    expect(final.dam.progress).toBe(0);
    expect(final.timerMs).toBe(0);
  });
});
