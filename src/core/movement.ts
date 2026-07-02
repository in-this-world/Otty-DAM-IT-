/**
 * P1-01: movement + world-bounds clamping.
 *
 * Command side (applyMove/applyStop, called from tick.ts): sets facing,
 * velocity and action. System side (movementSystem): integrates positions
 * by vel * dt each tick and clamps them to the world rect.
 */
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
  return withOtter(state, {
    ...otter,
    facing: dir,
    vel: { x: v.x * otter.speedPerSec, y: v.y * otter.speedPerSec },
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
 * Per-tick system: integrate pos += vel * dt, clamped to world bounds.
 * Returns the input state unchanged (same reference) when nothing moves.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- System signature
export function movementSystem(state: GameState, dtMs: number, _events: GameEvent[]): GameState {
  if (state.phase !== 'playing') return state;

  let changed = false;
  const otters: Record<string, OtterState> = {};
  for (const [id, o] of Object.entries(state.otters)) {
    if (o.vel.x === 0 && o.vel.y === 0) {
      otters[id] = o;
      continue;
    }
    const dt = dtMs / 1000;
    const x = Math.min(state.world.width, Math.max(0, o.pos.x + o.vel.x * dt));
    const y = Math.min(state.world.height, Math.max(0, o.pos.y + o.vel.y * dt));
    if (x === o.pos.x && y === o.pos.y) {
      otters[id] = o;
      continue;
    }
    otters[id] = { ...o, pos: { x, y } };
    changed = true;
  }
  return changed ? { ...state, otters } : state;
}
