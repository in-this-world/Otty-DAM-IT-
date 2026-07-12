/** P2-12: fish spawn in water and swim deterministically inside it. */
import { describe, expect, it } from 'vitest';
import {
  FISH_MARGIN,
  FISH_SWIM_SPEED_PER_SEC,
  fishSwimSystem,
} from '../../../src/core/fish';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameState, Rect } from '../../../src/core/types';

const WATER: Rect = { x: 0, y: 384, width: 384, height: 156 };
const WORLD = { width: 960, height: 540 };

function stateWithWater(): GameState {
  return createInitialState({ playerCount: 1, seed: 7, world: WORLD, water: [WATER] });
}

const inRect = (p: { x: number; y: number }, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

describe('P2-12 fish scatter', () => {
  it('every scattered fish spawns inside a water rect; land items stay out', () => {
    const state = stateWithWater();
    const fish = Object.values(state.items).filter((i) => i.type === 'fish');
    expect(fish.length).toBeGreaterThan(0);
    for (const f of fish) expect(inRect(f.pos, WATER), `${f.id} at ${f.pos.x},${f.pos.y}`).toBe(true);
    for (const it of Object.values(state.items)) {
      if (it.type === 'fish') continue;
      expect(inRect(it.pos, WATER), `${it.id} should be on land`).toBe(false);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(stateWithWater().items).toEqual(stateWithWater().items);
  });
});

describe('P2-12 fishSwimSystem', () => {
  it('moves free in-water fish and keeps them inside the rect', () => {
    let state = stateWithWater();
    const fishIds = Object.values(state.items)
      .filter((i) => i.type === 'fish')
      .map((i) => i.id);
    const before = new Map(fishIds.map((id) => [id, state.items[id]!.pos]));
    for (let t = 0; t < 200; t++) state = reduce(state, [], 50).state;
    let moved = 0;
    for (const id of fishIds) {
      const pos = state.items[id]!.pos;
      expect(inRect(pos, WATER), `${id} beached at ${pos.x},${pos.y}`).toBe(true);
      expect(pos.x).toBeGreaterThanOrEqual(WATER.x + FISH_MARGIN - 1e-6);
      expect(pos.x).toBeLessThanOrEqual(WATER.x + WATER.width - FISH_MARGIN + 1e-6);
      const b = before.get(id)!;
      if (pos.x !== b.x || pos.y !== b.y) moved++;
    }
    expect(moved).toBe(fishIds.length);
  });

  it('does not move held fish or land fish, and is identity-preserving without water', () => {
    const state = stateWithWater();
    const fishId = Object.values(state.items).find((i) => i.type === 'fish')!.id;
    // held fish: freeze
    const held: GameState = {
      ...state,
      items: { ...state.items, [fishId]: { ...state.items[fishId]!, heldBy: 'otter-1' } },
    };
    const afterHeld = fishSwimSystem(held, 50, []);
    expect(afterHeld.items[fishId]!.pos).toEqual(held.items[fishId]!.pos);
    // land fish: static
    const landed: GameState = {
      ...state,
      items: { ...state.items, [fishId]: { ...state.items[fishId]!, heldBy: null, pos: { x: 700, y: 200 } } },
    };
    expect(fishSwimSystem(landed, 50, []).items[fishId]!.pos).toEqual({ x: 700, y: 200 });
    // no water: identity
    const dry = createInitialState({ playerCount: 1, seed: 7, world: WORLD });
    expect(fishSwimSystem(dry, 50, [])).toBe(dry);
  });

  it('swims at the configured speed per tick', () => {
    const state = stateWithWater();
    const fish = Object.values(state.items).find((i) => i.type === 'fish')!;
    const after = fishSwimSystem(state, 50, []);
    const moved = Math.hypot(
      after.items[fish.id]!.pos.x - fish.pos.x,
      after.items[fish.id]!.pos.y - fish.pos.y,
    );
    // one 50ms tick, unless clamped by the rect edge
    expect(moved).toBeLessThanOrEqual((FISH_SWIM_SPEED_PER_SEC * 50) / 1000 + 1e-6);
    expect(moved).toBeGreaterThan(0);
  });
});
