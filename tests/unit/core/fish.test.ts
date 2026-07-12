/** P2-12: fish spawn in water and swim deterministically inside it. */
import { describe, expect, it } from 'vitest';
import {
  FISH_HEADING_PERIOD_TICKS,
  FISH_SWIM_SPEED_PER_SEC,
  fishBounds,
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
    const box = fishBounds(WATER);
    let moved = 0;
    for (const id of fishIds) {
      const pos = state.items[id]!.pos;
      expect(inRect(pos, WATER), `${id} beached at ${pos.x},${pos.y}`).toBe(true);
      // stays inside the visually-swimmable box (off the painted bank grass)
      expect(pos.x).toBeGreaterThanOrEqual(box.minX - 1e-6);
      expect(pos.x).toBeLessThanOrEqual(box.maxX + 1e-6);
      expect(pos.y).toBeGreaterThanOrEqual(box.minY - 1e-6);
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

  it('never pins in a corner: a cornered fish is steered back inside within an epoch', () => {
    const base = stateWithWater();
    const fishId = Object.values(base.items).find((i) => i.type === 'fish')!.id;
    const box = fishBounds(WATER);
    // Drop the fish exactly into the bottom-right corner of the swim box.
    let s: GameState = {
      ...base,
      items: { ...base.items, [fishId]: { ...base.items[fishId]!, pos: { x: box.maxX, y: box.maxY } } },
    };
    // Within two heading epochs it must have left the corner (wall-avoid
    // steering points the velocity inward regardless of the hashed angle).
    let escaped = false;
    for (let t = 0; t < FISH_HEADING_PERIOD_TICKS * 2 && !escaped; t++) {
      s = { ...fishSwimSystem(s, 50, []), tick: s.tick + 1 };
      const p = s.items[fishId]!.pos;
      if (box.maxX - p.x > 5 || box.maxY - p.y > 5) escaped = true;
    }
    expect(escaped).toBe(true);
  });

  it('rests some epochs (fish do not swim continuously)', () => {
    let s = stateWithWater();
    const fishIds = Object.values(s.items)
      .filter((i) => i.type === 'fish')
      .map((i) => i.id);
    // Across many epochs, every fish should have at least one resting tick
    // (position unchanged) and at least one swimming tick.
    const restingSeen = new Set<string>();
    const swimSeen = new Set<string>();
    for (let t = 0; t < FISH_HEADING_PERIOD_TICKS * 12; t++) {
      const prev = s;
      s = reduce(s, [], 50).state;
      for (const id of fishIds) {
        const a = prev.items[id]!.pos;
        const b = s.items[id]!.pos;
        if (a.x === b.x && a.y === b.y) restingSeen.add(id);
        else swimSeen.add(id);
      }
    }
    for (const id of fishIds) {
      expect(restingSeen.has(id), `${id} never rested`).toBe(true);
      expect(swimSeen.has(id), `${id} never swam`).toBe(true);
    }
  });

  it('swims at most the configured speed per tick', () => {
    let s = stateWithWater();
    const fishId = Object.values(s.items).find((i) => i.type === 'fish')!.id;
    let maxStep = 0;
    for (let t = 0; t < FISH_HEADING_PERIOD_TICKS * 6; t++) {
      const prev = s.items[fishId]!.pos;
      s = { ...fishSwimSystem(s, 50, []), tick: s.tick + 1 };
      const now = s.items[fishId]!.pos;
      maxStep = Math.max(maxStep, Math.hypot(now.x - prev.x, now.y - prev.y));
    }
    // sqrt(2) because wall-avoid can set both components to full magnitude
    expect(maxStep).toBeLessThanOrEqual(((FISH_SWIM_SPEED_PER_SEC * 50) / 1000) * Math.SQRT2 + 1e-6);
    expect(maxStep).toBeGreaterThan(0);
  });
});
