/**
 * P2-04 突發事件 (sudden events): the 🦅 eagle + 🐻 bear hazards.
 *
 * Each hazard is a tiny, deterministic state machine advanced once per tick by
 * `hazardSystem` (registered in the tick pipeline). Everything here is pure:
 * no Phaser, no wall-clock — the round timer (`state.timerMs`) drives the
 * schedule and injected `dtMs` drives the machines, so a Colyseus server (P3)
 * runs the identical code.
 *
 * Eagle (v0.1 §4.4): a shadow warns over a marked otter for EAGLE_WARNING_MS,
 * then it swoops. A target wearing a cone (immune) or floating in water
 * (dodging) is spared; otherwise the item is snatched from its paws and
 * carried off (removed from the world). Machine: warning -> swoop -> gone.
 *
 * Bear (v0.1 §4.4): walks in from the forest edge toward the nearest ground
 * fish (the lure) or, absent any fish, the nearest otter. Contact knocks an
 * otter flying (drop carried item + stun + knockback). Reaching a fish eats
 * it and lures the bear away; it also wanders off after BEAR_LIFETIME_MS.
 * Machine: approach -> leaving -> gone.
 *
 * Spawning is driven by `state.hazards.schedule` (built deterministically in
 * createInitialState when hazards are enabled). This module only *advances*
 * the schedule + machines, so it stays identity-preserving when idle.
 */
import type {
  BearState,
  EagleState,
  GameEvent,
  GameState,
  HazardSpawn,
  HazardsState,
  ItemState,
  OtterState,
  Vec2,
} from './types';

/* ---- Tuning constants (P2-04 owns these; see Docs/P2-04_summary.md). ---- */

/** Shadow warning before the eagle dives, ms (v0.1: 影子預警 3 秒). */
export const EAGLE_WARNING_MS = 3000;
/** Short dive/leave beat after the grab resolves, ms (visual only). */
export const EAGLE_SWOOP_MS = 400;

/** Bear walk speed, world units/sec (slower than an otter's 200). */
export const BEAR_SPEED_PER_SEC = 120;
/** An otter this close to the bear gets swatted. */
export const BEAR_HIT_RADIUS = 44;
/** The bear eats (and is lured by) a fish once this close to it. */
export const BEAR_EAT_RADIUS = 40;
/** How long the bear roams before wandering off on its own, ms. */
export const BEAR_LIFETIME_MS = 12_000;
/** Walk-off time once lured/expired before it despawns, ms. */
export const BEAR_LEAVE_MS = 2500;
/** Stun applied to an otter the bear swats, ms. */
export const BEAR_STUN_MS = 1500;
/** How far a swatted otter is knocked from the bear, world units. */
export const BEAR_KNOCKBACK = 48;

/* ------------------------------- helpers -------------------------------- */

function heldItemOf(
  items: Readonly<Record<string, ItemState>>,
  otterId: string,
): ItemState | undefined {
  return Object.values(items).find((i) => i.heldBy === otterId);
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Move `from` toward `to` by up to `maxStep`, clamped to the target. */
function moveToward(from: Vec2, to: Vec2, maxStep: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len <= maxStep || len === 0) return to;
  return { x: from.x + (dx / len) * maxStep, y: from.y + (dy / len) * maxStep };
}

/** Otters eligible to be hazard targets (present + not already down). */
function liveOtters(state: GameState): OtterState[] {
  return Object.values(state.otters).filter((o) => o.stunnedMs === 0);
}

/** Nearest ground fish (heldBy null) to `pos`, or null. */
function nearestGroundFish(state: GameState, pos: Vec2): ItemState | null {
  let best: ItemState | null = null;
  let bestD = Infinity;
  for (const it of Object.values(state.items)) {
    if (it.type !== 'fish' || it.heldBy !== null) continue;
    const d = dist(it.pos, pos);
    if (d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** Nearest otter to `pos`, or null. */
function nearestOtter(otters: readonly OtterState[], pos: Vec2): OtterState | null {
  let best: OtterState | null = null;
  let bestD = Infinity;
  for (const o of otters) {
    const d = dist(o.pos, pos);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

/* ------------------------------- spawning ------------------------------- */

/**
 * Pick the eagle's victim: prefer an otter carrying something (best comedy),
 * else any live otter. Deterministic (id order) so tests can pin it.
 */
export function pickEagleTarget(state: GameState): string | null {
  const live = liveOtters(state).sort((a, b) => a.id.localeCompare(b.id));
  if (live.length === 0) return null;
  const carrying = live.find((o) => o.carrying !== null);
  return (carrying ?? live[0]!).id;
}

/** Build a fresh eagle in its warning phase over the given target. */
export function spawnEagle(state: GameState, events: GameEvent[]): EagleState {
  const targetId = pickEagleTarget(state);
  const pos = (targetId && state.otters[targetId]?.pos) || {
    x: state.world.width / 2,
    y: state.world.height / 2,
  };
  events.push({ type: 'eagleWarning', targetId, pos });
  return { phase: 'warning', targetId, pos, timerMs: EAGLE_WARNING_MS };
}

/** Build a fresh bear at the forest edge (top-centre) starting to approach. */
export function spawnBear(state: GameState, events: GameEvent[]): BearState {
  const pos: Vec2 = { x: state.world.width / 2, y: 0 };
  events.push({ type: 'bearAppeared', pos });
  return {
    phase: 'approach',
    pos,
    targetOtterId: null,
    targetItemId: null,
    timerMs: BEAR_LIFETIME_MS,
  };
}

/* ----------------------------- eagle machine ---------------------------- */

interface StepResult<T> {
  readonly hazard: T | null; // null => despawned this tick
  readonly otters?: Record<string, OtterState>;
  readonly items?: Record<string, ItemState>;
}

/** Advance the eagle one tick. May mutate a returned otters/items draft. */
export function stepEagle(
  state: GameState,
  eagle: EagleState,
  dtMs: number,
  events: GameEvent[],
): StepResult<EagleState> {
  if (eagle.phase === 'swoop') {
    const timerMs = eagle.timerMs - dtMs;
    return { hazard: timerMs > 0 ? { ...eagle, timerMs } : null };
  }

  // phase === 'warning'
  const timerMs = eagle.timerMs - dtMs;
  const target = eagle.targetId ? state.otters[eagle.targetId] : undefined;
  if (timerMs > 0) {
    // Track the target under the shadow while the warning ticks down.
    const pos = target ? target.pos : eagle.pos;
    return { hazard: { ...eagle, timerMs, pos } };
  }

  // Warning elapsed -> resolve the swoop.
  const swoop: EagleState = {
    phase: 'swoop',
    targetId: eagle.targetId,
    pos: target ? target.pos : eagle.pos,
    timerMs: EAGLE_SWOOP_MS,
  };

  // Immune: target gone, wearing a cone, or dodging in water.
  const immune = !target || target.hat === 'cone' || target.floating === true;
  if (immune || target.carrying === null) {
    events.push({
      type: 'eagleSwooped',
      targetId: eagle.targetId,
      itemId: null,
      grabbed: false,
    });
    return { hazard: swoop };
  }

  // Snatch the carried item: it is carried off (removed from the world).
  const items: Record<string, ItemState> = { ...state.items };
  const held = heldItemOf(items, target.id);
  let itemId: string | null = null;
  if (held) {
    itemId = held.id;
    delete items[held.id];
  }
  const otters: Record<string, OtterState> = {
    ...state.otters,
    [target.id]: { ...target, carrying: null },
  };
  events.push({ type: 'eagleSwooped', targetId: target.id, itemId, grabbed: true });
  return { hazard: swoop, otters, items };
}

/* ------------------------------ bear machine ---------------------------- */

/** Advance the bear one tick. May mutate a returned otters/items draft. */
export function stepBear(
  state: GameState,
  bear: BearState,
  dtMs: number,
  events: GameEvent[],
): StepResult<BearState> {
  const step = (BEAR_SPEED_PER_SEC * dtMs) / 1000;

  if (bear.phase === 'leaving') {
    const timerMs = bear.timerMs - dtMs;
    // Walk back off the top (forest) edge.
    const pos = moveToward(bear.pos, { x: bear.pos.x, y: -40 }, step);
    if (timerMs <= 0) {
      events.push({ type: 'bearLeft' });
      return { hazard: null };
    }
    return { hazard: { ...bear, pos, timerMs } };
  }

  // phase === 'approach'
  const timerMs = bear.timerMs - dtMs;
  if (timerMs <= 0) {
    // Lost interest; wander off.
    return { hazard: { ...bear, phase: 'leaving', timerMs: BEAR_LEAVE_MS } };
  }

  // Fish on the ground lure the bear (priority); else chase the nearest otter.
  const fish = nearestGroundFish(state, bear.pos);
  if (fish) {
    const pos = moveToward(bear.pos, fish.pos, step);
    if (dist(pos, fish.pos) <= BEAR_EAT_RADIUS) {
      const items: Record<string, ItemState> = { ...state.items };
      delete items[fish.id];
      events.push({ type: 'bearLured', itemId: fish.id });
      return {
        hazard: { ...bear, pos, phase: 'leaving', timerMs: BEAR_LEAVE_MS, targetItemId: null },
        items,
      };
    }
    return { hazard: { ...bear, pos, targetItemId: fish.id, targetOtterId: null, timerMs } };
  }

  const target = nearestOtter(liveOtters(state), bear.pos);
  if (!target) {
    // Nobody to chase; drift toward the dam site and keep roaming.
    const pos = moveToward(bear.pos, state.dam.site, step);
    return { hazard: { ...bear, pos, targetOtterId: null, targetItemId: null, timerMs } };
  }

  const pos = moveToward(bear.pos, target.pos, step);
  if (dist(pos, target.pos) <= BEAR_HIT_RADIUS) {
    // Swat: drop the carried item, stun, and knock the otter back.
    const items: Record<string, ItemState> = { ...state.items };
    let droppedItemId: string | null = null;
    if (target.carrying !== null) {
      const held = heldItemOf(items, target.id);
      if (held) {
        droppedItemId = held.id;
        items[held.id] = { ...held, heldBy: null, pos: target.pos };
        events.push({
          type: 'itemDropped',
          playerId: target.id,
          itemId: held.id,
          itemType: held.type,
        });
      }
    }
    // Knock the otter away from the bear (clamped to world).
    let kx = target.pos.x - pos.x;
    let ky = target.pos.y - pos.y;
    const len = Math.hypot(kx, ky);
    if (len === 0) {
      ky = 1;
    } else {
      kx /= len;
      ky /= len;
    }
    const knocked: Vec2 = {
      x: Math.min(state.world.width, Math.max(0, target.pos.x + kx * BEAR_KNOCKBACK)),
      y: Math.min(state.world.height, Math.max(0, target.pos.y + ky * BEAR_KNOCKBACK)),
    };
    const otters: Record<string, OtterState> = {
      ...state.otters,
      [target.id]: {
        ...target,
        pos: knocked,
        carrying: null,
        wantsBuild: false,
        buildingMs: 0,
        vel: { x: 0, y: 0 },
        action: 'idle',
        stunnedMs: Math.max(target.stunnedMs, BEAR_STUN_MS),
        hat: null,
      },
    };
    events.push({ type: 'bearHitOtter', playerId: target.id, droppedItemId });
    events.push({ type: 'otterStunned', playerId: target.id, durationMs: BEAR_STUN_MS, cause: 'bear' });
    return { hazard: { ...bear, pos, targetOtterId: target.id, targetItemId: null, timerMs }, otters, items };
  }

  return { hazard: { ...bear, pos, targetOtterId: target.id, targetItemId: null, timerMs } };
}

/* ------------------------------- system --------------------------------- */

/**
 * Per-tick hazard system (register AFTER movement/effects so it reacts to the
 * post-move positions, like float/effects do). No-ops (identity-preserving)
 * unless hazards are present and there is something scheduled or active.
 */
export function hazardSystem(state: GameState, dtMs: number, events: GameEvent[]): GameState {
  const h = state.hazards;
  if (!h) return state;
  if (state.phase !== 'playing') return state;

  const nothingActive = h.eagle === null && h.bear === null && h.schedule.length === 0;
  if (nothingActive) return state;

  let eagle = h.eagle;
  let bear = h.bear;
  let schedule = h.schedule;
  let otters: Record<string, OtterState> | undefined;
  let items: Record<string, ItemState> | undefined;
  let changed = false;

  // 1. Fire due spawns (timer has counted down to/under the threshold).
  const stillPending: HazardSpawn[] = [];
  for (const spawn of schedule) {
    if (state.timerMs > spawn.atTimerMs) {
      stillPending.push(spawn);
      continue;
    }
    if (spawn.kind === 'eagle' && eagle === null) {
      eagle = spawnEagle(state, events);
      changed = true;
    } else if (spawn.kind === 'bear' && bear === null) {
      bear = spawnBear(state, events);
      changed = true;
    } else {
      // Slot busy; retry next tick.
      stillPending.push(spawn);
    }
  }
  if (stillPending.length !== schedule.length) {
    schedule = stillPending;
    changed = true;
  }

  // Draft view of otters/items that later steps read + mutate in sequence.
  const draft: GameState = state;
  const read = (): GameState => ({
    ...draft,
    otters: otters ?? draft.otters,
    items: items ?? draft.items,
  });

  // 2. Advance the eagle.
  if (eagle) {
    const r = stepEagle(read(), eagle, dtMs, events);
    eagle = r.hazard;
    if (r.otters) otters = r.otters;
    if (r.items) items = r.items;
    changed = true;
  }

  // 3. Advance the bear.
  if (bear) {
    const r = stepBear(read(), bear, dtMs, events);
    bear = r.hazard;
    if (r.otters) otters = r.otters;
    if (r.items) items = r.items;
    changed = true;
  }

  if (!changed) return state;

  const hazards: HazardsState = { eagle, bear, schedule };
  return {
    ...state,
    otters: otters ?? state.otters,
    items: items ?? state.items,
    hazards,
  };
}
