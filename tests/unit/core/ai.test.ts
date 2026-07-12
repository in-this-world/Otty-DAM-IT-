/**
 * P2-05: AI otter behaviour tree. Unit-tests each branch of
 * planOtterCommands, plus a headline acceptance test that drives the AI
 * through the real reduce() loop until a solo round is won before the flood.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_AXIS_DEADBAND,
  directionToward,
  planOtterCommands,
  recommendedAiCount,
  stepToward,
} from '../../../src/core/ai';
import { BUILD_ZONE_HALF } from '../../../src/core/dam';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameState, ItemState, OtterState, Vec2 } from '../../../src/core/types';

const WORLD = { width: 1000, height: 800 };
const TICK_MS = 50;

/** Build a minimal one-otter state we can poke at for the branch tests. */
function withScene(opts: {
  otter?: Partial<OtterState>;
  otterPos?: Vec2;
  items?: readonly ItemState[];
  damSite?: Vec2;
}): GameState {
  const base = createInitialState({
    playerCount: 1,
    seed: 1,
    world: WORLD,
    items: [], // no default scatter; we place items explicitly
  });
  const o = base.otters['otter-1'];
  if (!o) throw new Error('missing otter');
  const otter: OtterState = {
    ...o,
    ...opts.otter,
    pos: opts.otterPos ?? o.pos,
  };
  const items: Record<string, ItemState> = {};
  for (const it of opts.items ?? []) items[it.id] = it;
  return {
    ...base,
    otters: { 'otter-1': otter },
    items,
    dam: { ...base.dam, site: opts.damSite ?? base.dam.site },
  };
}

function groundItem(id: string, type: ItemState['type'], pos: Vec2): ItemState {
  return { id, type, pos, heldBy: null };
}

describe('directionToward', () => {
  it('picks the dominant axis', () => {
    expect(directionToward({ x: 0, y: 0 }, { x: 100, y: 10 })).toBe('right');
    expect(directionToward({ x: 0, y: 0 }, { x: -100, y: 10 })).toBe('left');
    expect(directionToward({ x: 0, y: 0 }, { x: 10, y: 100 })).toBe('down');
    expect(directionToward({ x: 0, y: 0 }, { x: 10, y: -100 })).toBe('up');
  });
});

describe('planOtterCommands branches', () => {
  it('returns [] for a missing otter', () => {
    const s = withScene({});
    expect(planOtterCommands(s, 'nope')).toEqual([]);
  });

  it('returns [] for a stunned otter', () => {
    const s = withScene({
      otter: { stunnedMs: 1000 },
      otterPos: { x: 100, y: 100 },
      items: [groundItem('b1', 'branch', { x: 100, y: 100 })],
    });
    expect(planOtterCommands(s, 'otter-1')).toEqual([]);
  });

  it('picks up a free branch within PICKUP_RADIUS', () => {
    const s = withScene({
      otterPos: { x: 100, y: 100 },
      items: [groundItem('b1', 'branch', { x: 110, y: 105 })],
    });
    expect(planOtterCommands(s, 'otter-1')).toEqual([
      { type: 'stop', playerId: 'otter-1' },
      { type: 'pickUp', playerId: 'otter-1', itemId: 'b1' },
    ]);
  });

  it('ignores held items and non-materials when picking a target', () => {
    const s = withScene({
      otterPos: { x: 100, y: 100 },
      items: [
        groundItem('fish1', 'fish', { x: 100, y: 100 }), // non-material, ignored
        { id: 'b-held', type: 'branch', pos: { x: 100, y: 100 }, heldBy: 'someone' }, // held, ignored
        groundItem('b-far', 'branch', { x: 400, y: 100 }), // the real nearest material
      ],
    });
    // b-far is out of pickup range -> should move toward it (right).
    expect(planOtterCommands(s, 'otter-1')).toEqual([
      { type: 'move', playerId: 'otter-1', dir: 'right' },
    ]);
  });

  it('moves toward the nearest branch when it is far', () => {
    const s = withScene({
      otterPos: { x: 500, y: 400 },
      items: [groundItem('b1', 'branch', { x: 500, y: 700 })],
    });
    expect(planOtterCommands(s, 'otter-1')).toEqual([
      { type: 'move', playerId: 'otter-1', dir: 'down' },
    ]);
  });

  it('stops when no free material exists anywhere', () => {
    const s = withScene({
      otterPos: { x: 100, y: 100 },
      items: [groundItem('fish1', 'fish', { x: 100, y: 100 })],
    });
    expect(planOtterCommands(s, 'otter-1')).toEqual([{ type: 'stop', playerId: 'otter-1' }]);
  });

  it('carrying a branch far from the dam moves toward the dam site', () => {
    const s = withScene({
      otter: { carrying: 'branch' },
      otterPos: { x: 500, y: 700 },
      damSite: { x: 500, y: 96 },
    });
    expect(planOtterCommands(s, 'otter-1')).toEqual([
      { type: 'move', playerId: 'otter-1', dir: 'up' },
    ]);
  });

  it('carrying a branch within the build zone of the dam builds', () => {
    const damSite = { x: 500, y: 96 };
    const s = withScene({
      otter: { carrying: 'branch' },
      otterPos: { x: 480 + (BUILD_ZONE_HALF.w - 1), y: 96 },
      damSite,
    });
    expect(planOtterCommands(s, 'otter-1')).toEqual([
      { type: 'stop', playerId: 'otter-1' },
      { type: 'build', playerId: 'otter-1' },
    ]);
  });

  it('carrying a non-material (fish) drops it', () => {
    const s = withScene({
      otter: { carrying: 'fish' },
      otterPos: { x: 500, y: 400 },
    });
    expect(planOtterCommands(s, 'otter-1')).toEqual([{ type: 'drop', playerId: 'otter-1' }]);
  });
});

describe('recommendedAiCount (人數平衡)', () => {
  it('fills up to the target', () => {
    expect(recommendedAiCount(1)).toBe(3);
    expect(recommendedAiCount(0, 4)).toBe(4);
    expect(recommendedAiCount(2, 4)).toBe(2);
  });
  it('never returns a negative count', () => {
    expect(recommendedAiCount(6, 4)).toBe(0);
  });
});

describe('AI acceptance (headline)', () => {
  it('a SOLO AI round completes the dam before the flood', () => {
    let s: GameState = createInitialState({
      playerCount: 1,
      seed: 7,
      world: WORLD,
      timerMs: 240_000,
    });
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 6000) {
      s = reduce(s, planOtterCommands(s, 'otter-1'), TICK_MS).state;
    }
    expect(s.phase).toBe('won');
    expect(s.timerMs).toBeGreaterThan(0);
  });

  it('a 2-AI cooperative round also wins before the flood', () => {
    let s: GameState = createInitialState({
      playerCount: 2,
      seed: 7,
      world: WORLD,
      timerMs: 240_000,
    });
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 6000) {
      const commands = [
        ...planOtterCommands(s, 'otter-1'),
        ...planOtterCommands(s, 'otter-2'),
      ];
      s = reduce(s, commands, TICK_MS).state;
    }
    expect(s.phase).toBe('won');
    expect(s.timerMs).toBeGreaterThan(0);
  });
});

describe('stepToward (smooth L-path, P2-05 tuning)', () => {
  it('resolves the horizontal axis fully before the vertical (one turn per leg)', () => {
    // far on both axes -> horizontal first
    expect(stepToward({ x: 0, y: 0 }, { x: 100, y: 100 })).toBe('right');
    // horizontal already aligned (within deadband) -> switch to vertical
    expect(stepToward({ x: 95, y: 0 }, { x: 100, y: 100 })).toBe('down');
    expect(stepToward({ x: 100, y: 100 }, { x: 100, y: 0 })).toBe('up');
    expect(stepToward({ x: 100, y: 0 }, { x: 0, y: 0 })).toBe('left');
  });
  it('returns null once within the deadband on both axes (arrived)', () => {
    expect(stepToward({ x: 0, y: 0 }, { x: AI_AXIS_DEADBAND - 1, y: AI_AXIS_DEADBAND - 1 })).toBeNull();
  });
});
