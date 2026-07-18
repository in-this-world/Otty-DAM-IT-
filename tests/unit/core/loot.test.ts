/**
 * P4-6: weighted dig loot table.
 *
 * LOOT_TABLE weights (sum 100): poop 20, mushroom 15, diamond 5, vest 3,
 * hat 3, nothing 54. rollLoot(rngValue) picks by cumulative-weight
 * boundary; applyDig feeds it exactly one rngStep(state.rngSeed) per dig,
 * so outcomes are pinned by seeding state.rngSeed directly in tests.
 *
 * Bucket boundaries (cumulative, as fractions of 1):
 *   poop     [0.00, 0.20)
 *   mushroom [0.20, 0.35)
 *   diamond  [0.35, 0.40)
 *   vest     [0.40, 0.43)
 *   hat      [0.43, 0.46)
 *   nothing  [0.46, 1.00)
 */
import { describe, expect, it } from 'vitest';
import {
  DIAMOND_SCORE,
  LOOT_TABLE,
  PIT_DIGGER_IMMUNE_MS,
  RARE_HAT_SCORE,
  VEST_SCORE,
  rollLoot,
} from '../../../src/core/items';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { Command, GameState, ItemType, OtterState, Vec2 } from '../../../src/core/types';

const TICK_MS = 50;
const WORLD = { width: 1000, height: 800 };

/** Seeds whose first rngStep() value lands in each named loot bucket. */
const SEED_FOR: Record<(typeof LOOT_TABLE)[number]['id'], number> = {
  poop: 7,
  mushroom: 0,
  diamond: 18,
  vest: 27,
  hat: 14,
  nothing: 1,
};

function setup(items: readonly { id: string; type: ItemType; pos: Vec2 }[] = []): GameState {
  return createInitialState({ playerCount: 3, seed: 1, world: WORLD, items });
}

function placeOtter(s: GameState, id: string, x: number, y: number): GameState {
  const o = s.otters[id];
  if (!o) throw new Error(`missing otter ${id}`);
  return { ...s, otters: { ...s.otters, [id]: { ...o, pos: { x, y } } } };
}

function otter(s: GameState, id: string): OtterState {
  const o = s.otters[id];
  if (!o) throw new Error(`missing otter ${id}`);
  return o;
}

function run(s: GameState, commands: readonly Command[]) {
  return reduce(s, commands, TICK_MS);
}

/** Dig with the RNG pinned so the roll lands on `outcome`. */
function digAs(outcome: keyof typeof SEED_FOR, x = 400, y = 400) {
  let s = setup([]);
  s = placeOtter(s, 'otter-1', x, y);
  s = { ...s, rngSeed: SEED_FOR[outcome] };
  return run(s, [{ type: 'dig', playerId: 'otter-1' }]);
}

describe('LOOT_TABLE', () => {
  it('weights sum to 100', () => {
    const total = LOOT_TABLE.reduce((sum, e) => sum + e.weight, 0);
    expect(total).toBe(100);
  });
});

describe('rollLoot: cumulative-weight boundaries', () => {
  it('rngValue 0 (and just under each upper bound) picks the right entry', () => {
    expect(rollLoot(0).id).toBe('poop');
    expect(rollLoot(0.1999).id).toBe('poop');
    expect(rollLoot(0.2).id).toBe('mushroom');
    expect(rollLoot(0.3499).id).toBe('mushroom');
    expect(rollLoot(0.35).id).toBe('diamond');
    expect(rollLoot(0.3999).id).toBe('diamond');
    expect(rollLoot(0.4).id).toBe('vest');
    expect(rollLoot(0.4299).id).toBe('vest');
    expect(rollLoot(0.43).id).toBe('hat');
    expect(rollLoot(0.4599).id).toBe('hat');
    expect(rollLoot(0.46).id).toBe('nothing');
  });

  it('rngValue near 1 picks nothing (the last bucket)', () => {
    expect(rollLoot(0.999999).id).toBe('nothing');
  });

  it('is pure: same input always yields the same entry', () => {
    expect(rollLoot(0.5)).toEqual(rollLoot(0.5));
  });
});

describe('applyDig: rolled outcomes', () => {
  it("'poop' is byte-identical to the pre-P4-6 dig: dirt item + pit, dugDirt/pitCreated events", () => {
    const { state, events } = digAs('poop');
    const dug = events.find((e) => e.type === 'dugDirt');
    expect(dug).toMatchObject({ playerId: 'otter-1', pos: { x: 400, y: 400 } });
    if (dug?.type !== 'dugDirt') throw new Error('expected dugDirt');
    expect(state.items[dug.itemId]).toMatchObject({ type: 'dirt', heldBy: null, pos: { x: 400, y: 400 } });
    expect(state.pits).toHaveLength(1);
    expect(state.pits[0]).toMatchObject({ pos: { x: 400, y: 400 }, diggerId: 'otter-1' });
    expect(events.some((e) => e.type === 'pitCreated')).toBe(true);
    expect(events).toContainEqual({
      type: 'lootRolled',
      playerId: 'otter-1',
      outcome: 'poop',
      itemId: dug.itemId,
    });
  });

  it("'mushroom' spawns a ground mushroom item at the dig spot, no pit", () => {
    const { state, events } = digAs('mushroom');
    expect(state.pits).toHaveLength(0);
    const rolled = events.find((e) => e.type === 'lootRolled');
    expect(rolled).toMatchObject({ playerId: 'otter-1', outcome: 'mushroom' });
    if (rolled?.type !== 'lootRolled') throw new Error('expected lootRolled');
    expect(rolled.itemId).toBeDefined();
    expect(state.items[rolled.itemId!]).toMatchObject({
      type: 'mushroom',
      heldBy: null,
      pos: { x: 400, y: 400 },
    });
    expect(events.some((e) => e.type === 'itemSpawned')).toBe(true);
    expect(events.some((e) => e.type === 'dugDirt')).toBe(false);
  });

  it("'diamond' grants instant score, no ground item, no pit", () => {
    const before = otter(setup([]), 'otter-1').score;
    const { state, events } = digAs('diamond');
    expect(state.pits).toHaveLength(0);
    expect(otter(state, 'otter-1').score).toBe(before + DIAMOND_SCORE);
    expect(events).toContainEqual({
      type: 'lootRolled',
      playerId: 'otter-1',
      outcome: 'diamond',
      scoreAwarded: DIAMOND_SCORE,
    });
  });

  it("'vest' equips gear.vest and grants a small score bump", () => {
    const { state, events } = digAs('vest');
    const o = otter(state, 'otter-1');
    expect(o.gear?.vest).toBe(true);
    expect(o.score).toBe(VEST_SCORE);
    expect(events).toContainEqual({
      type: 'lootRolled',
      playerId: 'otter-1',
      outcome: 'vest',
      scoreAwarded: VEST_SCORE,
    });
  });

  it("'hat' equips gear.rareHat (distinct from the cone hat slot) and grants a small score bump", () => {
    const { state, events } = digAs('hat');
    const o = otter(state, 'otter-1');
    expect(o.gear?.rareHat).toBe(true);
    expect(o.hat).toBeNull(); // the cone slot is untouched
    expect(o.score).toBe(RARE_HAT_SCORE);
    expect(events).toContainEqual({
      type: 'lootRolled',
      playerId: 'otter-1',
      outcome: 'hat',
      scoreAwarded: RARE_HAT_SCORE,
    });
  });

  it("'nothing' changes no state at all (no pit, no item, no score)", () => {
    const before = setup([]);
    const beforeScore = otter(before, 'otter-1').score;
    const { state, events } = digAs('nothing');
    expect(state.pits).toHaveLength(0);
    expect(otter(state, 'otter-1').score).toBe(beforeScore);
    expect(Object.keys(state.items)).toHaveLength(0);
    expect(events).toContainEqual({ type: 'lootRolled', playerId: 'otter-1', outcome: 'nothing' });
  });

  it('the digger grace-period pit mechanic still works after a poop roll (regression)', () => {
    let s = setup([]);
    s = placeOtter(s, 'otter-2', 50, 50);
    s = placeOtter(s, 'otter-3', 950, 50);
    s = placeOtter(s, 'otter-1', 400, 400);
    s = { ...s, rngSeed: SEED_FOR.poop };
    ({ state: s } = run(s, [{ type: 'dig', playerId: 'otter-1' }]));
    const graceTicks = Math.ceil(PIT_DIGGER_IMMUNE_MS / TICK_MS);
    for (let i = 0; i < graceTicks - 1; i++) {
      ({ state: s } = run(s, []));
      expect(otter(s, 'otter-1').stunnedMs).toBe(0);
    }
    const { state } = run(s, []);
    expect(otter(state, 'otter-1').stunnedMs).toBeGreaterThan(0);
  });
});
