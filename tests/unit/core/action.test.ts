/**
 * Transient poses (build/poke/eat) hold briefly then revert — otherwise the
 * otter freezes mid-pose until moved ("B build is stuck" bug).
 */
import { describe, expect, it } from 'vitest';
import { TRANSIENT_ACTION_HOLD_MS, transientActionSystem } from '../../../src/core/action';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameEvent, GameState, OtterState } from '../../../src/core/types';

function withOtter(s: GameState, patch: Partial<OtterState>): GameState {
  const o = s.otters['otter-1'];
  if (!o) throw new Error('no otter');
  return { ...s, otters: { ...s.otters, 'otter-1': { ...o, ...patch } } };
}

describe('transientActionSystem', () => {
  it('holds a build pose for ~TRANSIENT_ACTION_HOLD_MS then reverts to idle', () => {
    let s = createInitialState({ playerCount: 1, seed: 1 });
    s = withOtter(s, { action: 'build', actionMs: TRANSIENT_ACTION_HOLD_MS, carrying: null });
    const evs: GameEvent[] = [];
    // one tick: still holding
    s = transientActionSystem(s, 50, evs);
    expect(s.otters['otter-1']?.action).toBe('build');
    // run out the clock
    for (let i = 0; i < 8; i++) s = transientActionSystem(s, 50, evs);
    expect(s.otters['otter-1']?.action).toBe('idle');
  });

  it('reverts to carry when still holding an item', () => {
    let s = createInitialState({ playerCount: 1, seed: 1 });
    s = withOtter(s, { action: 'poke', actionMs: 0, carrying: 'branch' });
    s = transientActionSystem(s, 50, []);
    expect(s.otters['otter-1']?.action).toBe('carry');
  });

  it('a built otter is no longer stuck in the build pose after a few idle ticks (reduce)', () => {
    let s = createInitialState({
      playerCount: 1,
      seed: 1,
      world: { width: 960, height: 540 },
      items: [{ id: 'b1', type: 'branch', pos: { x: 480, y: 110 } }],
    });
    const o = s.otters['otter-1'];
    if (!o) throw new Error('no otter');
    s = {
      ...s,
      otters: { 'otter-1': { ...o, pos: { x: 480, y: 110 }, carrying: 'branch', action: 'carry' } },
      items: { b1: { id: 'b1', type: 'branch', pos: { x: 480, y: 110 }, heldBy: 'otter-1' } },
    };
    s = reduce(s, [{ type: 'build', playerId: 'otter-1' }], 50).state;
    expect(s.otters['otter-1']?.action).toBe('build'); // pose right after building
    for (let i = 0; i < 10; i++) s = reduce(s, [], 50).state; // stand still
    expect(s.otters['otter-1']?.action).toBe('idle'); // no longer stuck
  });
});
