/**
 * P4-8: per-player stat tallying + title assignment.
 *
 * PURE module (MASTER_PLAN §2.1 pattern): a reducer over GameEvent[] plus a
 * per-tick GameState sampler, exactly like the systems in core/tick.ts. Zero
 * Phaser imports, deterministic, unit-testable without a network or timers.
 *
 * Design decisions (see Docs/P4-endgame_summary.md for the full writeup):
 *  - Event-driven tally (tallyEvent) for discrete occurrences (fish eaten,
 *    dam pieces, loot rolls) — one GameEvent always maps to exactly one
 *    stat bump, so there is no risk of double-counting or missing a tick.
 *  - Swim time is NOT tracked via otterEnteredWater/otterLeftWater pairs
 *    (those events carry no duration, and pairing entry/exit ticks would
 *    require extra state + is fragile across disconnects/reconnects).
 *    Instead accumulateSwimTime reads `floating` directly off GameState
 *    once per tick and adds dtMs — simpler, self-correcting, matches
 *    design decision (b) from the brief.
 */
import type { GameEvent, GameState } from './types';

export interface PlayerStats {
  fishEaten: number;
  damPieces: number; // count of damProgressed EVENTS (occurrences), not amount
  poopsDug: number;
  mushrooms: number; // mushrooms EATEN (itemEaten with itemType 'mushroom') — NOT mushrooms dug
  swimTime: number; // ms spent with floating === true
  diamonds: number;
  doodles: number; // from RosterPayload.doodleCount, multiplayer only; 0/absent single-player
}

export function initStats(): PlayerStats {
  return {
    fishEaten: 0,
    damPieces: 0,
    poopsDug: 0,
    mushrooms: 0,
    swimTime: 0,
    diamonds: 0,
    doodles: 0,
  };
}

/**
 * Pure reducer: given the current per-player stats map + one GameEvent,
 * return an updated map. Only touches the otter(s) implicated by the
 * event's playerId; events for an otter not (yet) present in the map are
 * ignored (no-op), matching the "structural sharing" pattern used by the
 * core reduce() — callers that want an otter tracked must seed it first
 * (both RoomSimulation and LocalAdapter do this on state creation).
 */
export function tallyEvent(
  stats: Record<string, PlayerStats>,
  event: GameEvent,
): Record<string, PlayerStats> {
  switch (event.type) {
    case 'itemEaten': {
      if (!stats[event.playerId]) return stats;
      if (event.itemType !== 'fish' && event.itemType !== 'mushroom') return stats;
      const cur = stats[event.playerId]!;
      return {
        ...stats,
        [event.playerId]: {
          ...cur,
          fishEaten: cur.fishEaten + (event.itemType === 'fish' ? 1 : 0),
          mushrooms: cur.mushrooms + (event.itemType === 'mushroom' ? 1 : 0),
        },
      };
    }
    case 'damProgressed': {
      if (!stats[event.playerId]) return stats;
      const cur = stats[event.playerId]!;
      return { ...stats, [event.playerId]: { ...cur, damPieces: cur.damPieces + 1 } };
    }
    case 'lootRolled': {
      if (!stats[event.playerId]) return stats;
      if (event.outcome !== 'poop' && event.outcome !== 'diamond') return stats;
      const cur = stats[event.playerId]!;
      return {
        ...stats,
        [event.playerId]: {
          ...cur,
          poopsDug: cur.poopsDug + (event.outcome === 'poop' ? 1 : 0),
          diamonds: cur.diamonds + (event.outcome === 'diamond' ? 1 : 0),
        },
      };
    }
    default:
      return stats;
  }
}

/**
 * Called once per tick: add dtMs to swimTime for every otter with
 * floating === true, read directly off GameState.otters. Otters absent
 * from the stats map are skipped (not auto-seeded), same contract as
 * tallyEvent.
 */
export function accumulateSwimTime(
  stats: Record<string, PlayerStats>,
  state: GameState,
  dtMs: number,
): Record<string, PlayerStats> {
  let next = stats;
  let changed = false;
  for (const otter of Object.values(state.otters)) {
    if (!otter.floating) continue;
    const cur = next[otter.id];
    if (!cur) continue;
    if (!changed) {
      next = { ...next };
      changed = true;
    }
    next[otter.id] = { ...cur, swimTime: cur.swimTime + dtMs };
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Titles.                                                              */

/** Priority-ordered stat -> title key, checked in this exact order. */
const STAT_TITLES: readonly { stat: keyof PlayerStats; title: string }[] = [
  { stat: 'fishEaten', title: 'title.fish' },
  { stat: 'damPieces', title: 'title.dam' },
  { stat: 'poopsDug', title: 'title.poop' },
  { stat: 'mushrooms', title: 'title.mush' },
  { stat: 'swimTime', title: 'title.swim' },
];

/** Fallback pool for players left unassigned after the stat pass, cycled
 *  with modulo so titles never repeat within one game even with many
 *  players (the doc's own test uses 7+ players). Includes the 5 stat-title
 *  keys as extra filler once the two dedicated fallback titles run out. */
const FALLBACK_POOL: readonly string[] = [
  'title.nobita',
  'title.eagle',
  ...STAT_TITLES.map((s) => s.title),
];

export interface TitledPlayer {
  readonly id: string;
  readonly stats: PlayerStats;
}

/**
 * Assign each player exactly one title, no duplicates. Algorithm: for each
 * stat in priority order (fishEaten, damPieces, poopsDug, mushrooms,
 * swimTime), find the player with the HIGHEST value on that stat among
 * players not yet assigned a title, only if that value is > 0. Ties break
 * by array order (first player wins). Any player still unassigned after
 * the pass gets a fallback title, cycled from FALLBACK_POOL so no two
 * players share a title even when the fallback pool would otherwise repeat.
 */
export function assignTitles(players: readonly TitledPlayer[]): Record<string, string> {
  const titles: Record<string, string> = {};
  const used = new Set<string>();

  for (const { stat, title } of STAT_TITLES) {
    let best: TitledPlayer | null = null;
    for (const p of players) {
      if (titles[p.id]) continue;
      if (p.stats[stat] <= 0) continue;
      if (!best || p.stats[stat] > best.stats[stat]) best = p;
    }
    if (best) {
      titles[best.id] = title;
      used.add(title);
    }
  }

  let fallbackIdx = 0;
  for (const p of players) {
    if (titles[p.id]) continue;
    // Find the next fallback title not already used by anyone this game,
    // cycling through the pool (modulo) so we always land on something.
    let candidate = FALLBACK_POOL[fallbackIdx % FALLBACK_POOL.length]!;
    let attempts = 0;
    while (used.has(candidate) && attempts < FALLBACK_POOL.length) {
      fallbackIdx++;
      candidate = FALLBACK_POOL[fallbackIdx % FALLBACK_POOL.length]!;
      attempts++;
    }
    titles[p.id] = candidate;
    used.add(candidate);
    fallbackIdx++;
  }

  return titles;
}
