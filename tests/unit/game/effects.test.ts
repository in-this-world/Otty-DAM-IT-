/**
 * Unit tests for the pure event -> juice-effect mapping (src/game/effects.ts).
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, OtterState } from '../../../src/core/types';
import { effectsForEvent } from '../../../src/game/effects';

function otter(id: string, x: number, y: number): OtterState {
  return {
    id,
    pos: { x, y },
    facing: 'down',
    vel: { x: 0, y: 0 },
    action: 'idle',
    carrying: null,
    speedPerSec: 100,
    stunnedMs: 0,
    speedBoostMs: 0,
    hat: null,
    wantsBuild: false,
    score: 0,
  };
}

function state(): GameState {
  return {
    tick: 0,
    phase: 'playing',
    timerMs: 60000,
    dam: { progress: 0, required: 100, site: { x: 0, y: 0 } },
    otters: {
      a: otter('a', 10, 20),
      b: otter('b', 30, 40),
    },
    world: { width: 800, height: 600 },
    items: {},
    pits: [],
    rngSeed: 1,
  };
}

describe('effectsForEvent (juice mapping)', () => {
  it('otterPoked -> impact burst at target otter pos', () => {
    const ev: GameEvent = { type: 'otterPoked', attackerId: 'a', targetId: 'b' };
    expect(effectsForEvent(ev, state())).toEqual([
      { frame: 'obj_star_2', x: 30, y: 40, ttlMs: 400, riseY: 14 },
    ]);
  });

  it('bearHitOtter -> star burst at that otter pos', () => {
    const ev: GameEvent = { type: 'bearHitOtter', playerId: 'a', droppedItemId: null };
    expect(effectsForEvent(ev, state())).toEqual([
      { frame: 'obj_star_2', x: 10, y: 20, ttlMs: 450, riseY: 16 },
    ]);
  });

  it('pitCreated -> cluster at event pos', () => {
    const ev: GameEvent = { type: 'pitCreated', pitId: 'p1', pos: { x: 55, y: 66 } };
    expect(effectsForEvent(ev, state())).toEqual([
      { frame: 'obj_star_1', x: 55, y: 66, ttlMs: 400, riseY: 0 },
    ]);
  });

  it('otterEnteredWater -> small splash at otter pos', () => {
    const ev: GameEvent = { type: 'otterEnteredWater', playerId: 'b' };
    expect(effectsForEvent(ev, state())).toEqual([
      { frame: 'obj_splash_1', x: 30, y: 40, ttlMs: 350, riseY: 0 },
    ]);
  });

  it('eagleSwooped (grabbed) -> crown at target otter pos', () => {
    const ev: GameEvent = { type: 'eagleSwooped', targetId: 'a', itemId: 'i1', grabbed: true };
    expect(effectsForEvent(ev, state())).toEqual([
      { frame: 'obj_splash_2', x: 10, y: 20, ttlMs: 400, riseY: 0 },
    ]);
  });

  it('eagleSwooped (not grabbed) -> no effect', () => {
    const ev: GameEvent = { type: 'eagleSwooped', targetId: 'a', itemId: null, grabbed: false };
    expect(effectsForEvent(ev, state())).toEqual([]);
  });

  it('otterPoked with null target -> no effect', () => {
    const ev: GameEvent = { type: 'otterPoked', attackerId: 'a', targetId: null };
    expect(effectsForEvent(ev, state())).toEqual([]);
  });

  it('unrelated event (otterMoved) -> no effect', () => {
    const ev: GameEvent = { type: 'otterMoved', playerId: 'a', dir: 'up' };
    expect(effectsForEvent(ev, state())).toEqual([]);
  });

  it('missing otter id -> no throw, no effect', () => {
    const ev: GameEvent = { type: 'bearHitOtter', playerId: 'ghost', droppedItemId: null };
    expect(() => effectsForEvent(ev, state())).not.toThrow();
    expect(effectsForEvent(ev, state())).toEqual([]);
  });
});
