/**
 * P1-03: dam progress.
 *
 * Requirement curve: required = round(base * playerCount^0.85).
 * Sub-linear so bigger lobbies need more total branches but fewer per
 * player (co-op should feel easier with friends, not harder):
 *   base 20 -> 1P: 20, 2P: 36, 5P: 79, 10P: 142.
 *
 * Build flow: a valid `build` command (carrying a branch, within
 * BUILD_RADIUS of dam.site) marks the otter `wantsBuild`. The dam system
 * then resolves all builders of the tick together, applying a cooperation
 * bonus: each build contributes 1 * (1 + 0.25 * (builders - 1)).
 * Progress is capped at `required`; reaching it wins the round instantly.
 */
import type { GameEvent, GameState, OtterState } from './types';

/** Max distance from dam.site at which building is allowed. */
export const BUILD_RADIUS = 120;
/** Base progress per delivered branch. */
export const BUILD_AMOUNT = 1;
/** Extra multiplier per additional simultaneous builder. */
export const COOP_BONUS_PER_EXTRA_BUILDER = 0.25;

export function requiredProgress(playerCount: number, basePerPlayer: number): number {
  return Math.round(basePerPlayer * Math.pow(playerCount, 0.85));
}

export function coopMultiplier(builders: number): number {
  return 1 + COOP_BONUS_PER_EXTRA_BUILDER * (builders - 1);
}

type Reject = (reason: string) => void;

/** Command handler: validate and mark intent; resolution happens in damSystem. */
export function applyBuild(state: GameState, otter: OtterState, reject: Reject): GameState {
  if (otter.carrying !== 'branch') {
    reject('noBranch');
    return state;
  }
  const d = Math.hypot(otter.pos.x - state.dam.site.x, otter.pos.y - state.dam.site.y);
  if (d > BUILD_RADIUS) {
    reject('tooFarFromDam');
    return state;
  }
  return {
    ...state,
    otters: { ...state.otters, [otter.id]: { ...otter, wantsBuild: true } },
  };
}

export function scoresOf(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const o of Object.values(state.otters)) scores[o.id] = o.score;
  return scores;
}

/** Per-tick system: resolve all pending builds with the co-op bonus. */
export function damSystem(state: GameState, _dtMs: number, events: GameEvent[]): GameState {
  if (state.phase !== 'playing') return state;

  const builders = Object.values(state.otters).filter((o) => o.wantsBuild);
  if (builders.length === 0) return state;

  const mult = coopMultiplier(builders.length);
  const otters: Record<string, OtterState> = { ...state.otters };
  const items = { ...state.items };
  let progress = state.dam.progress;

  for (const b of builders) {
    const amount = Math.min(BUILD_AMOUNT * mult, state.dam.required - progress);
    progress += amount;
    // consume the carried branch
    const held = Object.values(items).find((i) => i.heldBy === b.id);
    if (held) delete items[held.id];
    otters[b.id] = {
      ...b,
      wantsBuild: false,
      carrying: null,
      action: 'build',
      score: b.score + amount,
    };
    events.push({ type: 'damProgressed', playerId: b.id, amount, progress });
    if (progress >= state.dam.required) break;
  }
  // clear intent on any builder skipped by the early break
  for (const [id, o] of Object.entries(otters)) {
    if (o.wantsBuild) otters[id] = { ...o, wantsBuild: false };
  }

  const won = progress >= state.dam.required;
  const next: GameState = {
    ...state,
    phase: won ? 'won' : state.phase,
    dam: { ...state.dam, progress },
    otters,
    items,
  };
  if (won) events.push({ type: 'gameWon', tick: next.tick, scores: scoresOf(next) });
  return next;
}
