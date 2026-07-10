/**
 * Pure event -> juice-effect mapping (演出 side, but Phaser-free).
 *
 * Maps a core `GameEvent` (plus the current `GameState`, needed only to
 * resolve otter positions) to zero or more short-lived "juice" sprite specs
 * the game layer should spawn. Static frames already live in the atlas:
 *   obj_star_0..3   single star / cluster / white impact burst / sparkle
 *   obj_splash_0..3 bubbles / small splash / splash crown / droplets
 *
 * Deterministic + pure: zero Phaser imports, no randomness, no time.
 */
import type { GameEvent, GameState, Vec2 } from '../core/types';

export interface EffectSpec {
  /** Atlas frame name, e.g. 'obj_star_2'. */
  readonly frame: string;
  readonly x: number;
  readonly y: number;
  /** How long the sprite lives before fading out, ms. */
  readonly ttlMs: number;
  /** Px to drift upward over its life (0 = none). */
  readonly riseY: number;
}

/** Position of an otter by id, or null when the id is unknown. */
function otterPos(state: GameState, id: string | null): Vec2 | null {
  if (id === null) return null;
  const otter = state.otters[id];
  return otter ? otter.pos : null;
}

/**
 * Map one event to the juice sprites to spawn for it. Returns [] for events
 * with no visual (and whenever a referenced otter is missing).
 */
export function effectsForEvent(event: GameEvent, state: GameState): EffectSpec[] {
  switch (event.type) {
    case 'otterPoked': {
      const pos = otterPos(state, event.targetId);
      if (!pos) return [];
      return [{ frame: 'obj_star_2', x: pos.x, y: pos.y, ttlMs: 400, riseY: 14 }];
    }
    case 'bearHitOtter': {
      const pos = otterPos(state, event.playerId);
      if (!pos) return [];
      return [{ frame: 'obj_star_2', x: pos.x, y: pos.y, ttlMs: 450, riseY: 16 }];
    }
    case 'pitCreated':
      return [{ frame: 'obj_star_1', x: event.pos.x, y: event.pos.y, ttlMs: 400, riseY: 0 }];
    case 'otterEnteredWater': {
      const pos = otterPos(state, event.playerId);
      if (!pos) return [];
      return [{ frame: 'obj_splash_1', x: pos.x, y: pos.y, ttlMs: 350, riseY: 0 }];
    }
    case 'eagleSwooped': {
      if (!event.grabbed) return [];
      const pos = otterPos(state, event.targetId);
      if (!pos) return [];
      return [{ frame: 'obj_splash_2', x: pos.x, y: pos.y, ttlMs: 400, riseY: 0 }];
    }
    default:
      return [];
  }
}
