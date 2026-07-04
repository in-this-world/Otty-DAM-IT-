/**
 * P1-03: dam progress. P2-01: multi-material builds.
 *
 * Requirement curve: required = round(base * playerCount^0.85).
 * Sub-linear so bigger lobbies need more total branches but fewer per
 * player (co-op should feel easier with friends, not harder):
 *   base 20 -> 1P: 20, 2P: 36, 5P: 79, 10P: 142.
 *
 * Build flow: a valid `build` command (carrying a build material, within
 * BUILD_RADIUS of dam.site) marks the otter `wantsBuild`. The dam system
 * then resolves all builders of the tick together, applying a cooperation
 * bonus: each build contributes BUILD_AMOUNTS[material] * (1 + 0.25 *
 * (builders - 1)). Materials (v0.1 §4.2): branch 1, dirt 1, stone 3.
 * Progress is capped at `required`; reaching it wins the round instantly.
 */
import type { GameEvent, GameState, ItemType, OtterState } from './types';

/** Max distance from dam.site at which building is allowed. */
export const BUILD_RADIUS = 120;
/** Base progress per delivered branch. */
export const BUILD_AMOUNT = 1;
/**
 * Base progress per material (P2-01). Item types missing here (fish, cone)
 * are not build materials and are rejected with 'noBuildMaterial'.
 */
export const BUILD_AMOUNTS: Partial<Record<ItemType, number>> = {
  branch: BUILD_AMOUNT,
  dirt: 1,
  stone: 3,
};
/** Extra multiplier per additional simultaneous builder. */
export const COOP_BONUS_PER_EXTRA_BUILDER = 0.25;
/**
 * Building is a channel: the otter plays the build animation ~3 times
 * (3 x 375ms) and the progress only lands when the channel completes.
 * Moving, being poked/stunned, dropping the material, or leaving range
 * cancels it (the material is kept).
 */
export const BUILD_CHANNEL_MS = 1125;

export function requiredProgress(playerCount: number, basePerPlayer: number): number {
  return Math.round(basePerPlayer * Math.pow(playerCount, 0.85));
}

export function coopMultiplier(builders: number): number {
  return 1 + COOP_BONUS_PER_EXTRA_BUILDER * (builders - 1);
}

type Reject = (reason: string) => void;

/** Command handler: validate and mark intent; resolution happens in damSystem. */
export function applyBuild(state: GameState, otter: OtterState, reject: Reject): GameState {
  if ((otter.buildingMs ?? 0) > 0) return state; // already channeling; ignore repeat presses
  if (otter.carrying === null || BUILD_AMOUNTS[otter.carrying] === undefined) {
    reject('noBuildMaterial');
    return state;
  }
  const d = Math.hypot(otter.pos.x - state.dam.site.x, otter.pos.y - state.dam.site.y);
  if (d > BUILD_RADIUS) {
    reject('tooFarFromDam');
    return state;
  }
  // start the build channel; progress lands when it completes (damSystem).
  return {
    ...state,
    otters: {
      ...state.otters,
      [otter.id]: { ...otter, buildingMs: BUILD_CHANNEL_MS, action: 'build' },
    },
  };
}

export function scoresOf(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const o of Object.values(state.otters)) scores[o.id] = o.score;
  return scores;
}

/** Per-tick system: resolve all pending builds with the co-op bonus. */
export function damSystem(state: GameState, dtMs: number, events: GameEvent[]): GameState {
  if (state.phase !== 'playing') return state;

  const channeling = Object.values(state.otters).filter((o) => (o.buildingMs ?? 0) > 0);
  if (channeling.length === 0) return state;

  const otters: Record<string, OtterState> = { ...state.otters };
  const completers: string[] = [];

  // 1. advance or cancel each active build channel this tick.
  for (const o of channeling) {
    const hasMaterial = o.carrying !== null && BUILD_AMOUNTS[o.carrying] !== undefined;
    const inRange =
      Math.hypot(o.pos.x - state.dam.site.x, o.pos.y - state.dam.site.y) <= BUILD_RADIUS;
    const moving = o.vel.x !== 0 || o.vel.y !== 0;
    if (!hasMaterial || !inRange || o.stunnedMs > 0 || moving) {
      // interrupted -> cancel; the otter keeps its material.
      otters[o.id] = { ...o, buildingMs: 0, action: o.carrying !== null ? 'carry' : 'idle' };
      continue;
    }
    const remaining = (o.buildingMs ?? 0) - dtMs;
    if (remaining > 0) {
      otters[o.id] = { ...o, buildingMs: remaining, action: 'build' };
    } else {
      completers.push(o.id);
    }
  }

  if (completers.length === 0) return { ...state, otters };

  // 2. apply every channel that finished this tick, sharing the co-op bonus.
  const mult = coopMultiplier(completers.length);
  const items = { ...state.items };
  let progress = state.dam.progress;
  for (const id of completers) {
    const b = otters[id];
    if (!b) continue;
    if (progress >= state.dam.required) {
      otters[id] = { ...b, buildingMs: 0, action: b.carrying !== null ? 'carry' : 'idle' };
      continue;
    }
    const base = (b.carrying !== null ? BUILD_AMOUNTS[b.carrying] : undefined) ?? 0;
    const amount = Math.min(base * mult, state.dam.required - progress);
    progress += amount;
    const held = Object.values(items).find((i) => i.heldBy === id);
    if (held) delete items[held.id];
    otters[id] = { ...b, buildingMs: 0, carrying: null, action: 'idle', score: b.score + amount };
    events.push({ type: 'damProgressed', playerId: id, amount, progress });
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
