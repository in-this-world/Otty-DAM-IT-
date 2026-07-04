/**
 * Transient action poses (poke / eat) should play briefly and then
 * fall back to idle/carry — otherwise the otter freezes mid-pose until the
 * player happens to move (the "B build is stuck" bug). Each transient action
 * is stamped with `actionMs` when set; this system counts it down and reverts
 * the pose when it expires.
 */
import type { GameEvent, GameState, OtterAction, OtterState } from './types';

/** How long a one-shot pose (build/poke/eat) is held before reverting, ms. */
export const TRANSIENT_ACTION_HOLD_MS = 350;

const TRANSIENT: ReadonlySet<OtterAction> = new Set<OtterAction>(['poke', 'eat']);

export function transientActionSystem(
  state: GameState,
  dtMs: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- System signature
  _events: GameEvent[],
): GameState {
  if (state.phase !== 'playing') return state;

  let changed = false;
  const otters: Record<string, OtterState> = {};
  for (const [id, o] of Object.entries(state.otters)) {
    if (!TRANSIENT.has(o.action)) {
      otters[id] = o;
      continue;
    }
    const remaining = Math.max(0, (o.actionMs ?? 0) - dtMs);
    if (remaining > 0) {
      otters[id] = { ...o, actionMs: remaining };
      changed = true;
      continue;
    }
    const moving = o.vel.x !== 0 || o.vel.y !== 0;
    const action: OtterAction = o.carrying !== null ? 'carry' : moving ? 'walk' : 'idle';
    otters[id] = { ...o, action, actionMs: 0 };
    changed = true;
  }
  return changed ? { ...state, otters } : state;
}
