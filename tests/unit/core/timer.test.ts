/**
 * P1-04: countdown + flood win/lose verdict.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameState } from '../../../src/core/types';

const TICK_MS = 50;

function shortRound(timerMs: number): GameState {
  return createInitialState({ playerCount: 2, seed: 3, timerMs, items: [] });
}

function runOut(s: GameState, ticks: number) {
  const all: ReturnType<typeof reduce>['events'] = [];
  for (let i = 0; i < ticks; i++) {
    const r = reduce(s, [], TICK_MS);
    s = r.state;
    all.push(...r.events);
  }
  return { state: s, events: all };
}

describe('core/timer (P1-04)', () => {
  it('counts down while playing and never goes negative', () => {
    let s = shortRound(120);
    ({ state: s } = reduce(s, [], TICK_MS));
    expect(s.timerMs).toBe(70);
    ({ state: s } = reduce(s, [], TICK_MS));
    ({ state: s } = reduce(s, [], TICK_MS));
    expect(s.timerMs).toBe(0);
    expect(s.timerMs).toBeGreaterThanOrEqual(0);
  });

  it('expiry with an incomplete dam -> lost, with per-otter scores, exactly once', () => {
    const { state, events } = runOut(shortRound(3 * TICK_MS), 6);
    expect(state.phase).toBe('lost');
    const lost = events.filter((e) => e.type === 'gameLost');
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ scores: { 'otter-1': 0, 'otter-2': 0 } });
    expect(events.filter((e) => e.type === 'gameWon')).toHaveLength(0);
  });

  it('expiry with a complete dam -> won (180s round)', () => {
    let s = shortRound(180_000);
    s = { ...s, dam: { ...s.dam, progress: s.dam.required } };
    // dam already complete but phase still playing (e.g. pre-completed fixture):
    // run one tick -> timer still counting, dam system untouched, then jump to expiry
    s = { ...s, timerMs: TICK_MS };
    const { state, events } = runOut(s, 2);
    expect(state.phase).toBe('won');
    expect(events.filter((e) => e.type === 'gameWon')).toHaveLength(1);
  });

  it('timer freezes once the round is decided', () => {
    const { state } = runOut(shortRound(TICK_MS), 3);
    expect(state.phase).toBe('lost');
    const again = reduce(state, [], TICK_MS).state;
    expect(again.timerMs).toBe(state.timerMs);
  });
});
