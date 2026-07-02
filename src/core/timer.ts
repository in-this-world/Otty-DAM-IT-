/**
 * P1-04: countdown + flood verdict.
 *
 * While 'playing', timerMs decreases by dt each tick (floored at 0).
 * At expiry: dam complete -> 'won' + gameWon, else -> 'lost' + gameLost.
 * Runs after damSystem, so a same-tick completion wins before the flood.
 * Events fire exactly once (phase guard prevents re-entry).
 */
import { scoresOf } from './dam';
import type { GameEvent, GameState } from './types';

export function timerSystem(state: GameState, dtMs: number, events: GameEvent[]): GameState {
  if (state.phase !== 'playing') return state;

  const timerMs = Math.max(0, state.timerMs - dtMs);
  if (timerMs > 0) return { ...state, timerMs };

  const won = state.dam.progress >= state.dam.required;
  const next: GameState = { ...state, timerMs, phase: won ? 'won' : 'lost' };
  events.push(
    won
      ? { type: 'gameWon', tick: next.tick, scores: scoresOf(next) }
      : { type: 'gameLost', tick: next.tick, scores: scoresOf(next) },
  );
  return next;
}
