/**
 * P1 integration: a full scripted round through the public reduce() API —
 * pick branches, carry them to the dam, build to victory; and an idle
 * round that loses to the flood.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameEvent, GameState } from '../../../src/core/types';

const TICK_MS = 50;
const WORLD = { width: 1000, height: 800 };

describe('core simulation (P1-01..04 wired together)', () => {
  it('a scripted solo round wins before the flood', () => {
    // branches stockpiled right at the dam site; otter standing on them
    let s: GameState = createInitialState({
      playerCount: 1,
      seed: 9,
      world: WORLD,
      timerMs: 60_000,
      items: Array.from({ length: 30 }, (_, i) => ({
        id: `b${i + 1}`,
        type: 'branch' as const,
        pos: { x: 500, y: 120 },
      })),
    });
    const o = s.otters['otter-1'];
    if (!o) throw new Error('missing otter');
    s = { ...s, otters: { 'otter-1': { ...o, pos: { x: 500, y: 120 } } } };

    const events: GameEvent[] = [];
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 800) {
      const r = reduce(
        s,
        [
          { type: 'pickUp', playerId: 'otter-1' },
          { type: 'build', playerId: 'otter-1' },
        ],
        TICK_MS,
      );
      s = r.state;
      events.push(...r.events);
    }

    expect(s.phase).toBe('won');
    expect(s.timerMs).toBeGreaterThan(0);
    expect(s.dam.progress).toBe(s.dam.required);
    expect(events.filter((e) => e.type === 'gameWon')).toHaveLength(1);
    expect(s.otters['otter-1']?.score).toBe(s.dam.required);
  });

  it('an idle round loses when the flood arrives', () => {
    let s = createInitialState({ playerCount: 3, seed: 5, timerMs: 500 });
    const events: GameEvent[] = [];
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 50) {
      const r = reduce(s, [], TICK_MS);
      s = r.state;
      events.push(...r.events);
    }
    expect(s.phase).toBe('lost');
    expect(events.filter((e) => e.type === 'gameLost')).toHaveLength(1);
    expect(s.dam.progress).toBe(0);
  });
});
