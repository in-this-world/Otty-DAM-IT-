/**
 * P1-03: dam requirement curve + co-op build bonus.
 */
import { describe, expect, it } from 'vitest';
import {
  BUILD_CHANNEL_MS,
  BUILD_ZONE_HALF,
  coopMultiplier,
  damSystem,
  requiredProgress,
} from '../../../src/core/dam';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameState } from '../../../src/core/types';

const TICK_MS = 50;
const WORLD = { width: 1000, height: 800 };

/** Exhaustive curve for the default base of 20: required = round(20 * n^0.85). */
const EXPECTED_CURVE: Record<number, number> = {
  1: 20, 2: 36, 3: 51, 4: 65, 5: 79, 6: 92, 7: 105, 8: 117, 9: 129, 10: 142,
};

function atDam(playerCount: number, itemsNearDam: number): GameState {
  const s = createInitialState({
    playerCount,
    seed: 1,
    world: WORLD,
    items: Array.from({ length: itemsNearDam }, (_, i) => ({
      id: `b${i + 1}`,
      type: 'branch' as const,
      pos: { x: 500, y: 120 },
    })),
  });
  const otters = Object.fromEntries(
    Object.values(s.otters).map((o) => [o.id, { ...o, pos: { x: 500, y: 120 } }]),
  );
  return { ...s, otters };
}

/** Run idle ticks until the dam progresses or the round ends (build is now a channel). */
function runChannel(s: GameState, maxTicks = 40): { state: GameState; events: import('../../../src/core/types').GameEvent[] } {
  const start = s.dam.progress;
  const events: import('../../../src/core/types').GameEvent[] = [];
  for (let i = 0; i < maxTicks && s.dam.progress === start && s.phase === 'playing'; i++) {
    const r = reduce(s, [], TICK_MS);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('core/dam (P1-03)', () => {
  it('requirement curve is sub-linear and exhaustively matches for 1-10 players', () => {
    for (let n = 1; n <= 10; n++) {
      expect(requiredProgress(n, 20), `players=${n}`).toBe(EXPECTED_CURVE[n]);
    }
    // sanity: total grows, per-player need shrinks
    for (let n = 2; n <= 10; n++) {
      expect(requiredProgress(n, 20)).toBeGreaterThan(requiredProgress(n - 1, 20));
      expect(requiredProgress(n, 20) / n).toBeLessThan(requiredProgress(n - 1, 20) / (n - 1));
    }
  });

  it('coop multiplier: 1x solo, +0.25 per extra simultaneous builder', () => {
    expect(coopMultiplier(1)).toBe(1);
    expect(coopMultiplier(2)).toBe(1.25);
    expect(coopMultiplier(4)).toBe(1.75);
  });

  it('build is a channel: progress lands only after ~3 anim plays, then consumes the branch', () => {
    let s = atDam(1, 2);
    ({ state: s } = reduce(s, [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS));
    // start the channel
    ({ state: s } = reduce(s, [{ type: 'build', playerId: 'otter-1' }], TICK_MS));
    expect(s.dam.progress).toBe(0); // not applied yet
    expect(s.otters['otter-1']?.buildingMs).toBe(BUILD_CHANNEL_MS - TICK_MS);
    expect(s.otters['otter-1']?.action).toBe('build');
    // ~500ms in, still channeling
    for (let i = 0; i < 9; i++) ({ state: s } = reduce(s, [], TICK_MS));
    expect(s.dam.progress).toBe(0);
    // let the ~1125ms channel finish
    const { state, events } = runChannel(s);
    expect(state.dam.progress).toBe(1);
    expect(state.otters['otter-1']?.carrying).toBeNull();
    expect(state.otters['otter-1']?.score).toBe(1);
    expect(state.otters['otter-1']?.action).toBe('idle'); // not stuck in build pose
    expect(Object.keys(state.items)).toHaveLength(1);
    expect(events).toContainEqual({
      type: 'damProgressed', playerId: 'otter-1', amount: 1, progress: 1,
    });
  });

  it('moving cancels the build channel and keeps the material', () => {
    let s = atDam(1, 2);
    ({ state: s } = reduce(s, [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS));
    ({ state: s } = reduce(s, [{ type: 'build', playerId: 'otter-1' }], TICK_MS));
    expect(s.otters['otter-1']?.buildingMs).toBeGreaterThan(0);
    // walk away: cancels
    ({ state: s } = reduce(s, [{ type: 'move', playerId: 'otter-1', dir: 'down' }], TICK_MS));
    ({ state: s } = reduce(s, [], TICK_MS));
    expect(s.otters['otter-1']?.buildingMs ?? 0).toBe(0);
    expect(s.otters['otter-1']?.carrying).toBe('branch'); // material kept
    expect(s.dam.progress).toBe(0);
  });

  it('two otters building in the same tick each get the 1.25x co-op bonus', () => {
    let s = atDam(2, 4);
    ({ state: s } = reduce(s, [
      { type: 'pickUp', playerId: 'otter-1' },
      { type: 'pickUp', playerId: 'otter-2' },
    ], TICK_MS));
    ({ state: s } = reduce(s, [
      { type: 'build', playerId: 'otter-1' },
      { type: 'build', playerId: 'otter-2' },
    ], TICK_MS));
    // both channels started the same tick -> they complete the same tick -> 1.25x each
    const { state } = runChannel(s);
    expect(state.dam.progress).toBeCloseTo(2.5);
    expect(state.otters['otter-1']?.score).toBeCloseTo(1.25);
    expect(state.otters['otter-2']?.score).toBeCloseTo(1.25);
  });

  it('rejects build with empty paws and build too far from the dam', () => {
    const s = atDam(1, 1);
    const empty = reduce(s, [{ type: 'build', playerId: 'otter-1' }], TICK_MS);
    expect(empty.events).toContainEqual({
      type: 'commandRejected', playerId: 'otter-1', command: 'build', reason: 'noBuildMaterial',
    });

    let far = atDam(1, 1);
    ({ state: far } = reduce(far, [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS));
    const o = far.otters['otter-1'];
    if (!o) throw new Error('missing otter');
    far = {
      ...far,
      otters: {
        'otter-1': { ...o, pos: { x: 500, y: 96 + BUILD_ZONE_HALF.h + 1 } },
      },
    };
    const { events } = reduce(far, [{ type: 'build', playerId: 'otter-1' }], TICK_MS);
    expect(events).toContainEqual({
      type: 'commandRejected', playerId: 'otter-1', command: 'build', reason: 'tooFarFromDam',
    });
  });

  it('progress caps at required and completion wins instantly (gameWon once)', () => {
    let s = atDam(1, 25);
    s = { ...s, dam: { ...s.dam, progress: s.dam.required - 0.5 } };
    ({ state: s } = reduce(s, [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS));
    ({ state: s } = reduce(s, [{ type: 'build', playerId: 'otter-1' }], TICK_MS));
    const { state, events } = runChannel(s);
    expect(state.dam.progress).toBe(state.dam.required);
    expect(state.phase).toBe('won');
    expect(events.filter((e) => e.type === 'gameWon')).toHaveLength(1);
    // won phase: further commands are rejected, no more win events
    const after = reduce(state, [{ type: 'build', playerId: 'otter-1' }], TICK_MS);
    expect(after.events.filter((e) => e.type === 'gameWon')).toHaveLength(0);
  });

  it('damSystem is identity (same reference) when nobody builds', () => {
    const s = atDam(3, 1);
    expect(damSystem(s, TICK_MS, [])).toBe(s);
  });
});
