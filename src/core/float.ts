/**
 * P2-03: 漂浮 (float) + 手牽手水獺筏 (otter raft) + 洗澡去 (wash-off debuff).
 *
 * Water zones are axis-aligned Rects on the GameState. Once per tick (after
 * movement, so we react to where an otter *moved* this tick) this system:
 *
 *   1. Detects land<->water transitions, toggling `floating` and the 'float'
 *      action, and emitting otterEnteredWater / otterLeftWater.
 *   2. Washes off debuffs on entering water: `stunnedMs` is cleared to 0 and
 *      a debuffWashedOff event fires (the "go take a bath" recovery, v0.1).
 *   3. Builds rafts: connected components of currently-floating otters whose
 *      pairwise distance <= RAFT_LINK_RADIUS. Each otter's `raftLinks` is set
 *      to (componentSize - 1); a raftFormed event fires per multi-otter raft.
 *
 * The co-op reward — a linked raft moves faster — lives in items.ts
 * (`effectiveSpeedPerSec`) so movement is the single source of truth; it
 * multiplies speed by min(1 + RAFT_SPEED_BONUS_PER_LINK * raftLinks, cap).
 * That means the bonus applies from the *next* tick, which is intended.
 *
 * Identity-preserving: when there is no water AND no otter is floating, the
 * input state reference is returned unchanged (structural-sharing guarantee).
 */
import { RAFT_SPEED_BONUS_CAP, RAFT_SPEED_BONUS_PER_LINK } from './items';
import type { GameEvent, GameState, OtterState, Rect, Vec2 } from './types';

/* Tuning constants (P2-03 owns these; see Docs/P2-03_summary.md). */

/** Two floating otters within this distance link into the same raft. */
export const RAFT_LINK_RADIUS = 64;

// Re-exported so callers can reason about the raft bonus from one place.
export { RAFT_SPEED_BONUS_CAP, RAFT_SPEED_BONUS_PER_LINK };

/** True when `pos` lies inside any water rect (edges inclusive). */
export function isInWater(pos: Vec2, water: readonly Rect[] | undefined): boolean {
  if (!water) return false;
  for (const r of water) {
    if (
      pos.x >= r.x &&
      pos.x <= r.x + r.width &&
      pos.y >= r.y &&
      pos.y <= r.y + r.height
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Per-tick system (register AFTER movementSystem). See file header.
 */
export function floatSystem(state: GameState, _dtMs: number, events: GameEvent[]): GameState {
  if (state.phase !== 'playing') return state;

  const water = state.water;
  const anyFloating = Object.values(state.otters).some((o) => o.floating);
  // Nothing to do: no water and nobody currently marked floating.
  if ((!water || water.length === 0) && !anyFloating) return state;

  // First pass: recompute floating/transition/wash-off per otter.
  const otters: Record<string, OtterState> = {};
  let changed = false;
  const floating: OtterState[] = [];

  for (const [id, o] of Object.entries(state.otters)) {
    // Hold-to-swim (P2-03): float only when in water AND swim intent is held.
    const inWater = isInWater(o.pos, water) && o.wantsSwim === true;
    const wasFloating = o.floating === true;
    let next = o;

    if (inWater && !wasFloating) {
      // land -> water: start floating, wash off debuffs.
      const washed = o.stunnedMs > 0;
      next = {
        ...o,
        floating: true,
        action: o.action === 'idle' || o.action === 'walk' ? 'float' : o.action,
        stunnedMs: 0,
      };
      events.push({ type: 'otterEnteredWater', playerId: id });
      if (washed) events.push({ type: 'debuffWashedOff', playerId: id });
      changed = true;
    } else if (!inWater && wasFloating) {
      // water -> land: stop floating.
      next = {
        ...o,
        floating: false,
        raftLinks: 0,
        action: o.action === 'float' ? 'idle' : o.action,
      };
      events.push({ type: 'otterLeftWater', playerId: id });
      changed = true;
    }

    otters[id] = next;
    if (next.floating) floating.push(next);
  }

  // Second pass: raft components over the (post-transition) floating set.
  // Assign raftLinks = componentSize - 1, and emit raftFormed per multi-otter raft.
  const grouped = groupComponents(floating);
  for (const members of grouped) {
    const links = members.length - 1;
    for (const id of members) {
      const cur = otters[id]!;
      if ((cur.raftLinks ?? 0) !== links) {
        otters[id] = { ...cur, raftLinks: links };
        changed = true;
      }
    }
    if (members.length >= 2) {
      events.push({ type: 'raftFormed', playerIds: members });
    }
  }

  return changed ? { ...state, otters } : state;
}

/** Group floating otters into connected components (list of id lists). */
function groupComponents(floating: readonly OtterState[]): string[][] {
  const parent = new Map<string, string>();
  for (const o of floating) parent.set(o.id, o.id);
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const r2 = RAFT_LINK_RADIUS * RAFT_LINK_RADIUS;
  for (let i = 0; i < floating.length; i++) {
    for (let j = i + 1; j < floating.length; j++) {
      const a = floating[i]!;
      const b = floating[j]!;
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      if (dx * dx + dy * dy <= r2) union(a.id, b.id);
    }
  }
  const groups = new Map<string, string[]>();
  for (const o of floating) {
    const root = find(o.id);
    const arr = groups.get(root) ?? [];
    arr.push(o.id);
    groups.set(root, arr);
  }
  return [...groups.values()];
}

/* ------------------------------------------------------------------ */
/* swim / stopSwim commands (P2-03 hold-to-swim): toggle the intent flag. */

function withOtter(state: GameState, otter: OtterState): GameState {
  return { ...state, otters: { ...state.otters, [otter.id]: otter } };
}

/** swim command: raise the swim-intent flag (hold-to-swim). */
export function applySwim(state: GameState, otter: OtterState): GameState {
  if (otter.wantsSwim === true) return state;
  return withOtter(state, { ...otter, wantsSwim: true });
}

/** stopSwim command: lower the swim-intent flag; float ends next tick. */
export function applyStopSwim(state: GameState, otter: OtterState): GameState {
  if (!otter.wantsSwim) return state;
  return withOtter(state, { ...otter, wantsSwim: false });
}
