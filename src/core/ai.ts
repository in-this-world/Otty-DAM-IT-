/**
 * P2-05: AI otter behaviour — a pure, stateless external controller.
 *
 * This module is NOT wired into the tick pipeline; it is an *advisor* that,
 * given the current GameState and an otter id, returns the Command[] that AI
 * otter should issue this tick. The caller (a game/net layer, later) feeds
 * those commands straight into the existing reduce() loop — exactly as the
 * integration tests script human commands. Keeping it stateless (no memory
 * between ticks) makes it replay-safe and server-portable (P3).
 *
 * Behaviour tree (fill-in worker, 撿 → 搬 → 建):
 *   1. missing / stunned          -> [] (can't act)
 *   2. carrying a build material  -> in BUILD_RADIUS ? build : move toward dam
 *   3. carrying a non-material    -> drop it (only materials help the dam)
 *   4. empty-handed               -> nearest free material:
 *        in PICKUP_RADIUS ? stop+pickUp : move toward it
 *        (no free material anywhere -> stop)
 *
 * "人數平衡": recommendedAiCount fills a lobby up to a target head-count.
 */
import { BUILD_AMOUNTS, BUILD_RADIUS } from './dam';
import { PICKUP_RADIUS } from './inventory';
import type { Command, Direction, GameState, ItemState, Vec2 } from './types';

/** True when `type` is a material that actually advances the dam. */
function isBuildMaterial(type: ItemState['type']): boolean {
  return BUILD_AMOUNTS[type] !== undefined;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Direction from `from` toward `to`, choosing the dominant axis so a chain
 * of these steps walks a rough straight line to the target. Ties favour the
 * horizontal axis (arbitrary but deterministic).
 */
export function directionToward(from: Vec2, to: Vec2): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'down' : 'up';
}

/**
 * How close (world units) on an axis counts as "aligned" — below this the AI
 * stops nudging that axis, which prevents per-tick left/right (or up/down)
 * jitter when it is basically lined up. See AI_AXIS_DEADBAND.
 */
export const AI_AXIS_DEADBAND = 16;

/**
 * A smoother travel step than directionToward: fully resolve the axis with
 * the larger remaining gap first (ignoring sub-deadband wobble), then the
 * other. This walks a clean L-shaped path instead of staircasing every tick
 * toward a diagonal target, so AI otters read as deliberate, not frantic.
 * Returns null when both axes are within the deadband (arrived).
 */
export function stepToward(from: Vec2, to: Vec2, deadband = AI_AXIS_DEADBAND): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  // Fixed priority: resolve the horizontal axis fully, THEN the vertical.
  // Committing to one axis at a time yields a clean L-path (~1 turn per leg)
  // instead of staircasing (a turn almost every tick) toward diagonal targets.
  if (adx > deadband) return dx >= 0 ? 'right' : 'left';
  if (ady > deadband) return dy >= 0 ? 'down' : 'up';
  return null;
}

/** Nearest ground (heldBy===null) build-material item, or null if none exist. */
function nearestFreeMaterial(state: GameState, from: Vec2): ItemState | null {
  let best: ItemState | null = null;
  let bestDist = Infinity;
  for (const item of Object.values(state.items)) {
    if (item.heldBy !== null) continue;
    if (!isBuildMaterial(item.type)) continue;
    const d = dist(item.pos, from);
    if (d < bestDist) {
      best = item;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Plan the commands the AI otter `otterId` should issue this tick.
 * Pure: depends only on the passed state; issues at most one "action"
 * command per tick (prefixed with a stop so the otter halts exactly on the
 * target rather than drifting past it on its carried velocity).
 */
export function planOtterCommands(state: GameState, otterId: string): Command[] {
  const otter = state.otters[otterId];
  // Missing otter or dizzy otter: can't act this tick.
  if (!otter || otter.stunnedMs > 0) return [];

  const carrying = otter.carrying;
  if (carrying !== null) {
    if (isBuildMaterial(carrying)) {
      // 搬 → 建: haul the material to the dam and build.
      if (dist(otter.pos, state.dam.site) <= BUILD_RADIUS) {
        return [{ type: 'stop', playerId: otterId }, { type: 'build', playerId: otterId }];
      }
      const toDam = stepToward(otter.pos, state.dam.site);
      return toDam === null
        ? [{ type: 'stop', playerId: otterId }]
        : [{ type: 'move', playerId: otterId, dir: toDam }];
    }
    // Carrying a non-material (e.g. a fish): it can't build the dam, so drop
    // it and free our paws to grab a branch next tick. (design choice)
    return [{ type: 'drop', playerId: otterId }];
  }

  // 撿: empty-handed — go get the nearest free build material.
  const target = nearestFreeMaterial(state, otter.pos);
  if (!target) {
    // Nothing left to carry; stand still (the round is likely already decided).
    return [{ type: 'stop', playerId: otterId }];
  }
  if (dist(otter.pos, target.pos) <= PICKUP_RADIUS) {
    return [
      { type: 'stop', playerId: otterId },
      { type: 'pickUp', playerId: otterId, itemId: target.id },
    ];
  }
  const toItem = stepToward(otter.pos, target.pos);
  return toItem === null
    ? [{ type: 'stop', playerId: otterId }]
    : [{ type: 'move', playerId: otterId, dir: toItem }];
}

/**
 * "人數平衡": how many AI otters to add so a lobby reaches `target` players.
 * Never negative (a full/overfull lobby gets no fill-ins).
 */
export function recommendedAiCount(humanCount: number, target = 4): number {
  return Math.max(0, target - humanCount);
}
