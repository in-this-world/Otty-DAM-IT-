/**
 * P2-02: poke (戳人 D).
 *
 * A poke reaches the nearest OTHER otter within POKE_RADIUS and knocks the
 * item out of their paws (it drops at their feet), then grants that victim a
 * short invulnerability window (POKE_INVULN_MS) so they can't be repeatedly
 * farmed. A poke that connects with an already-invulnerable otter bounces
 * off (no drop, no refresh). A whiff (no otter in reach) still plays the
 * attacker's poke animation and emits otterPoked with targetId=null.
 *
 * Command side only; the invuln timer decays passively in effects.ts.
 */
import { TRANSIENT_ACTION_HOLD_MS } from './action';
import type { GameEvent, GameState, ItemState, OtterState } from './types';

/** Reach of a poke, world units. */
export const POKE_RADIUS = 90;
/** Invulnerability granted to a poked otter, ms (v0.1 §4: 2s 無敵幀). */
export const POKE_INVULN_MS = 2000;

function heldItemOf(
  items: Record<string, ItemState>,
  otterId: string,
): ItemState | undefined {
  return Object.values(items).find((i) => i.heldBy === otterId);
}

/** poke command: knock the nearest otter's item loose + grant them i-frames. */
export function applyPoke(state: GameState, otter: OtterState, events: GameEvent[]): GameState {
  let target: OtterState | null = null;
  let bestDist = Infinity;
  for (const o of Object.values(state.otters)) {
    if (o.id === otter.id) continue;
    const d = Math.hypot(o.pos.x - otter.pos.x, o.pos.y - otter.pos.y);
    if (d <= POKE_RADIUS && d < bestDist) {
      target = o;
      bestDist = d;
    }
  }

  // The attacker always plays the poke animation, hit or miss.
  const attacker: OtterState = { ...otter, action: 'poke', actionMs: TRANSIENT_ACTION_HOLD_MS };
  const withAttacker = (s: GameState): GameState => ({
    ...s,
    otters: { ...s.otters, [otter.id]: attacker },
  });

  if (!target) {
    events.push({ type: 'otterPoked', attackerId: otter.id, targetId: null });
    return withAttacker(state);
  }

  events.push({ type: 'otterPoked', attackerId: otter.id, targetId: target.id });

  // Invulnerable victims shrug it off (no drop, no refresh).
  if ((target.invulnMs ?? 0) > 0) {
    return withAttacker(state);
  }

  const otters: Record<string, OtterState> = { ...state.otters, [otter.id]: attacker };
  const items: Record<string, ItemState> = { ...state.items };

  if (target.carrying !== null) {
    const held = heldItemOf(items, target.id);
    if (held) {
      items[held.id] = { ...held, heldBy: null, pos: target.pos };
      events.push({
        type: 'itemDropped',
        playerId: target.id,
        itemId: held.id,
        itemType: held.type,
      });
    }
  }

  otters[target.id] = {
    ...target,
    carrying: null,
    wantsBuild: false,
    invulnMs: POKE_INVULN_MS,
    vel: { x: 0, y: 0 },
    action: 'idle',
  };

  return { ...state, otters, items };
}
