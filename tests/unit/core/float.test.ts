/**
 * P2-03: 漂浮 (float) + 手牽手水獺筏 (raft) + 洗澡去 (wash-off debuff).
 *
 * isInWater geometry; land<->water transitions and events; debuff wash-off
 * on entering water; raft connected-components -> raftLinks -> speed bonus
 * via effectiveSpeedPerSec; identity preservation; and one full round trip
 * through the real reduce() pipeline to prove the system is wired.
 */
import { describe, expect, it } from 'vitest';
import {
  RAFT_LINK_RADIUS,
  RAFT_SPEED_BONUS_PER_LINK,
  floatSystem,
  isInWater,
} from '../../../src/core/float';
import { effectiveSpeedPerSec } from '../../../src/core/items';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameEvent, GameState, OtterState, Rect } from '../../../src/core/types';

const TICK_MS = 50;
const WORLD = { width: 1000, height: 800 };
const WATER: Rect = { x: 400, y: 400, width: 200, height: 200 };

function setup(water: readonly Rect[] = [WATER]): GameState {
  return createInitialState({ playerCount: 3, seed: 1, world: WORLD, water, items: [] });
}

function place(s: GameState, id: string, x: number, y: number, patch: Partial<OtterState> = {}): GameState {
  const o = s.otters[id];
  if (!o) throw new Error(`missing otter ${id}`);
  return { ...s, otters: { ...s.otters, [id]: { ...o, pos: { x, y }, ...patch } } };
}

function otter(s: GameState, id: string): OtterState {
  const o = s.otters[id];
  if (!o) throw new Error(`missing otter ${id}`);
  return o;
}

function runFloat(s: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const state = floatSystem(s, TICK_MS, events);
  return { state, events };
}

/* ------------------------------------------------------------------ */

describe('isInWater', () => {
  it('point inside a water rect', () => {
    expect(isInWater({ x: 500, y: 500 }, [WATER])).toBe(true);
  });
  it('point outside a water rect', () => {
    expect(isInWater({ x: 100, y: 100 }, [WATER])).toBe(false);
  });
  it('point exactly on the edge counts as inside', () => {
    expect(isInWater({ x: 400, y: 400 }, [WATER])).toBe(true);
    expect(isInWater({ x: 600, y: 600 }, [WATER])).toBe(true);
  });
  it('undefined water is never inside', () => {
    expect(isInWater({ x: 500, y: 500 }, undefined)).toBe(false);
    expect(isInWater({ x: 500, y: 500 }, [])).toBe(false);
  });
});

describe('float transitions', () => {
  it('otter standing in water becomes floating and emits otterEnteredWater', () => {
    let s = setup();
    s = place(s, 'otter-1', 500, 500);
    // move the other two well away so they never raft with otter-1
    s = place(s, 'otter-2', 50, 50);
    s = place(s, 'otter-3', 900, 50);
    const { state, events } = runFloat(s);
    expect(otter(state, 'otter-1').floating).toBe(true);
    expect(otter(state, 'otter-1').action).toBe('float');
    expect(events.some((e) => e.type === 'otterEnteredWater' && e.playerId === 'otter-1')).toBe(true);
  });

  it('leaving water clears floating and emits otterLeftWater', () => {
    let s = setup();
    s = place(s, 'otter-1', 500, 500, { floating: true, raftLinks: 0, action: 'float' });
    s = place(s, 'otter-2', 50, 50);
    s = place(s, 'otter-3', 900, 50);
    // now move otter-1 out of the water
    s = place(s, 'otter-1', 100, 100, { floating: true, action: 'float' });
    const { state, events } = runFloat(s);
    expect(otter(state, 'otter-1').floating).toBe(false);
    expect(otter(state, 'otter-1').action).toBe('idle');
    expect(events.some((e) => e.type === 'otterLeftWater' && e.playerId === 'otter-1')).toBe(true);
  });
});

describe('wash-off debuff', () => {
  it('a stunned otter entering water has stunnedMs cleared and emits debuffWashedOff', () => {
    let s = setup();
    s = place(s, 'otter-1', 500, 500, { stunnedMs: 1500 });
    s = place(s, 'otter-2', 50, 50);
    s = place(s, 'otter-3', 900, 50);
    const { state, events } = runFloat(s);
    expect(otter(state, 'otter-1').stunnedMs).toBe(0);
    expect(otter(state, 'otter-1').floating).toBe(true);
    expect(events.some((e) => e.type === 'debuffWashedOff' && e.playerId === 'otter-1')).toBe(true);
  });

  it('no debuffWashedOff when the entering otter was not stunned', () => {
    let s = setup();
    s = place(s, 'otter-1', 500, 500);
    s = place(s, 'otter-2', 50, 50);
    s = place(s, 'otter-3', 900, 50);
    const { events } = runFloat(s);
    expect(events.some((e) => e.type === 'debuffWashedOff')).toBe(false);
  });
});

describe('rafts', () => {
  it('two floating otters within RAFT_LINK_RADIUS each get raftLinks=1 and a speed bonus', () => {
    let s = setup();
    s = place(s, 'otter-1', 480, 500);
    s = place(s, 'otter-2', 480 + RAFT_LINK_RADIUS - 4, 500); // within radius
    s = place(s, 'otter-3', 50, 50); // on land, far away
    const { state, events } = runFloat(s);
    expect(otter(state, 'otter-1').raftLinks).toBe(1);
    expect(otter(state, 'otter-2').raftLinks).toBe(1);

    // speed of a linked otter is boosted vs a lone floating otter
    const linked = otter(state, 'otter-1');
    const lone: OtterState = { ...linked, raftLinks: 0 };
    expect(effectiveSpeedPerSec(linked)).toBeCloseTo(
      lone.speedPerSec * (1 + RAFT_SPEED_BONUS_PER_LINK),
    );
    expect(effectiveSpeedPerSec(linked)).toBeGreaterThan(effectiveSpeedPerSec(lone));

    expect(events.some((e) => e.type === 'raftFormed')).toBe(true);
  });

  it('three floating otters in a chain each reflect the component size', () => {
    let s = setup();
    s = place(s, 'otter-1', 420, 500);
    s = place(s, 'otter-2', 420 + RAFT_LINK_RADIUS - 4, 500);
    s = place(s, 'otter-3', 420 + 2 * (RAFT_LINK_RADIUS - 4), 500);
    const { state } = runFloat(s);
    expect(otter(state, 'otter-1').raftLinks).toBe(2);
    expect(otter(state, 'otter-2').raftLinks).toBe(2);
    expect(otter(state, 'otter-3').raftLinks).toBe(2);
  });

  it('a lone floating otter and land otters get no raft bonus', () => {
    let s = setup();
    s = place(s, 'otter-1', 500, 500); // alone in water
    s = place(s, 'otter-2', 50, 50); // land
    s = place(s, 'otter-3', 950, 50); // land
    const { state } = runFloat(s);
    expect(otter(state, 'otter-1').raftLinks).toBe(0);
    expect(effectiveSpeedPerSec(otter(state, 'otter-1'))).toBe(otter(state, 'otter-1').speedPerSec);
    expect(otter(state, 'otter-2').floating).toBe(false);
    expect(effectiveSpeedPerSec(otter(state, 'otter-2'))).toBe(otter(state, 'otter-2').speedPerSec);
  });
});

describe('identity preservation', () => {
  it('returns the same reference when there is no water and nobody floating', () => {
    const s = setup([]);
    const { state } = runFloat(s);
    expect(state).toBe(s);
  });
});

describe('reduce() wiring', () => {
  it('moving an otter into water over ticks makes it float via the default pipeline', () => {
    // water rect straddling the path; otter starts just left, walks right.
    const water: Rect = { x: 300, y: 90, width: 400, height: 400 };
    let s = createInitialState({ playerCount: 2, seed: 7, world: WORLD, water: [water], items: [] });
    s = place(s, 'otter-1', 280, 200);
    s = place(s, 'otter-2', 340, 200); // already inside so they can raft

    const events: GameEvent[] = [];
    let guard = 0;
    while (!otter(s, 'otter-1').floating && guard++ < 50) {
      const r = reduce(s, [{ type: 'move', playerId: 'otter-1', dir: 'right' }], TICK_MS);
      s = r.state;
      events.push(...r.events);
    }

    expect(otter(s, 'otter-1').floating).toBe(true);
    expect(events.some((e) => e.type === 'otterEnteredWater' && e.playerId === 'otter-1')).toBe(true);

    // once both float within radius, the raft speed bonus shows up.
    // step one more tick so raftLinks settle for both.
    ({ state: s } = reduce(s, [], TICK_MS));
    const o1 = otter(s, 'otter-1');
    if (o1.raftLinks && o1.raftLinks > 0) {
      expect(effectiveSpeedPerSec(o1)).toBeGreaterThan(o1.speedPerSec);
    }
  });
});
