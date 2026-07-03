/**
 * P1-01: movement + world-bounds clamping.
 * P2-01: speed modifiers (fish boost, stone weight) and stun immobility.
 *
 * Command side (applyMove/applyStop, called from tick.ts): sets facing,
 * velocity and action. System side (movementSystem): integrates positions
 * by the *current* effective speed each tick and clamps to the world rect,
 * so buffs that expire (or a stone picked up) change speed mid-walk.
 */
import { effectiveSpeedPerSec } from './items';
import type { Direction, GameEvent, GameState, OtterState, Vec2 } from './types';

const DIR_VECTORS: Readonly<Record<Direction, Vec2>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function isDirection(value: unknown): value is Direction {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right';
}

function withOtter(state: GameState, otter: OtterState): GameState {
  return { ...state, otters: { ...state.otters, [otter.id]: otter } };
}

/** move command: face + walk in a direction (action stays 'carry' with full paws). */
export function applyMove(state: GameState, otter: OtterState, dir: Direction): GameState {
  const v = DIR_VECTORS[dir];
  const speed = effectiveSpeedPerSec(otter);
  return withOtter(state, {
    ...otter,
    facing: dir,
    vel: { x: v.x * speed, y: v.y * speed },
    action: otter.carrying !== null ? 'carry' : 'walk',
  });
}

/** stop command: halt; idle when empty-handed, keep 'carry' when loaded. */
export function applyStop(state: GameState, otter: OtterState): GameState {
  return withOtter(state, {
    ...otter,
    vel: { x: 0, y: 0 },
    action: otter.carrying !== null ? 'carry' : 'idle',
  });
}

/**
 * Per-tick system: integrate pos += dir(vel) * effectiveSpeed * dt, clamped
 * to world bounds. `vel` records intent; the magnitude actually applied is
 * recomputed here so boosts/weights take effect immediately. Stunned otters
 * do not move. Returns the input state (same reference) when nothing moves.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- System signature
export function movementSystem(state: GameState, dtMs: number, _events: GameEvent[]): GameState {
  if (state.phase !== 'playing') return state;

  let changed = false;
  const otters: Record<string, OtterState> = {};
  for (const [id, o] of Object.entries(state.otters)) {
    if ((o.vel.x === 0 && o.vel.y === 0) || o.stunnedMs > 0) {
      otters[id] = o;
      continue;
    }
    const len = Math.hypot(o.vel.x, o.vel.y);
    const speed = effectiveSpeedPerSec(o);
    const dt = dtMs / 1000;
    const x = Math.min(state.world.width, Math.max(0, o.pos.x + (o.vel.x / len) * speed * dt));
    const y = Math.min(state.world.height, Math.max(0, o.pos.y + (o.vel.y / len) * speed * dt));
    if (x === o.pos.x && y === o.pos.y) {
      otters[id] = o;
      continue;
    }
    otters[id] = { ...o, pos: { x, y } };
    changed = true;
  }
  return changed ? { ...state, otters } : state;
}
