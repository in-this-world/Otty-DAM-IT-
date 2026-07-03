/**
 * P2-01: passive status effects, run once per tick after movement.
 *
 * 1. Decay each otter's stunnedMs / speedBoostMs by dt.
 * 2. Resolve pit collisions: the first non-immune otter standing within
 *    PIT_RADIUS falls in (stun + hat knock-off) and the pit fills itself.
 * 3. Decay pit digger-grace timers (after the collision check, so the
 *    digger enjoys the full PIT_DIGGER_IMMUNE_MS).
 *
 * Identity-preserving: returns the input state unchanged when there is
 * nothing to decay and no pits (keeps structural-sharing guarantees).
 */
import { applyStun, PIT_RADIUS, PIT_STUN_MS } from './items';
import type { GameEvent, GameState, ItemState, OtterState, PitState } from './types';

export function effectsSystem(state: GameState, dtMs: number, events: GameEvent[]): GameState {
  if (state.phase !== 'playing') return state;

  const idle =
    state.pits.length === 0 &&
    Object.values(state.otters).every(
      (o) => o.stunnedMs === 0 && o.speedBoostMs === 0 && (o.invulnMs ?? 0) === 0,
    );
  if (idle) return state;

  const otters: Record<string, OtterState> = {};
  for (const [id, o] of Object.entries(state.otters)) {
    otters[id] =
      o.stunnedMs === 0 && o.speedBoostMs === 0 && (o.invulnMs ?? 0) === 0
        ? o
        : {
            ...o,
            stunnedMs: Math.max(0, o.stunnedMs - dtMs),
            speedBoostMs: Math.max(0, o.speedBoostMs - dtMs),
            invulnMs: Math.max(0, (o.invulnMs ?? 0) - dtMs),
          };
  }

  const items: Record<string, ItemState> = { ...state.items };
  const pits: PitState[] = [];
  for (const pit of state.pits) {
    const victim = Object.values(otters).find(
      (o) =>
        o.stunnedMs === 0 &&
        !(o.id === pit.diggerId && pit.diggerImmuneMs > 0) &&
        Math.hypot(o.pos.x - pit.pos.x, o.pos.y - pit.pos.y) <= PIT_RADIUS,
    );
    if (victim) {
      applyStun(otters, items, victim.id, PIT_STUN_MS, 'pit', state.tick, events);
      events.push({ type: 'pitFilled', pitId: pit.id, playerId: victim.id });
      // the pit fills itself and is gone
    } else {
      pits.push({ ...pit, diggerImmuneMs: Math.max(0, pit.diggerImmuneMs - dtMs) });
    }
  }

  return { ...state, otters, items, pits };
}
