/**
 * P2-01: item effects — the command side.
 *
 * useItem:   fish -> eat (speed boost), cone -> wear as hat.
 * throwItem: hurl the carried item in the facing direction; a flying fish
 *            stuns the first otter on its path (party sabotage, v0.1 §4.2).
 * dig:       empty-handed otters dig up a dirt block and leave a pit
 *            behind (v0.1 §4.3 挖土; the pit is the designed pratfall).
 *
 * The passive side (buff/stun decay, pit collisions) lives in effects.ts.
 */
import { TRANSIENT_ACTION_HOLD_MS } from './action';
import { repelBear, repelEagle } from './hazards';
import type { GameEvent, GameState, ItemState, OtterState, Vec2 } from './types';

/* Tuning constants (P2-01 owns these numbers; see Docs/P2-01_summary.md). */

/** Fish speed-boost duration, ms (v0.1 plan: 5 s 加速). */
export const FISH_BOOST_MS = 5000;
/** Speed multiplier while the fish boost is active. */
export const FISH_SPEED_MULT = 1.5;
/** Speed multiplier while lugging a stone (v0.1: 較重,移速下降). */
export const STONE_CARRY_SPEED_MULT = 0.5;
/** How far a thrown item flies, world units. */
export const THROW_DISTANCE = 160;
/** An otter within this distance of the throw path is hit. */
export const THROW_HIT_RADIUS = 40;
/** Stun from a fish to the face, ms. */
export const THROWN_FISH_STUN_MS = 2000;
/** Otters within this distance of a pit centre fall in. */
export const PIT_RADIUS = 32;
/** Stun from falling into a pit, ms. */
export const PIT_STUN_MS = 1500;
/** Grace period during which the digger cannot fall into their own pit, ms. */
export const PIT_DIGGER_IMMUNE_MS = 2000;

/**
 * P2-03 raft speed bonus (owned by float.ts conceptually; the multiplier is
 * applied here because effectiveSpeedPerSec is the single source of truth for
 * movement). Kept small so a hand-linked raft is a co-op reward, not a
 * runaway.
 */
export const RAFT_SPEED_BONUS_PER_LINK = 0.15;
/** Cap on the total raft speed multiplier (>= this many links stop helping). */
export const RAFT_SPEED_BONUS_CAP = 1.6;

type Reject = (reason: string) => void;

const DIR_VECTORS: Readonly<Record<OtterState['facing'], Vec2>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Effective movement speed: base x fish boost x stone weight.
 * Read by movement each tick, so buffs apply/expire mid-walk.
 */
export function effectiveSpeedPerSec(otter: OtterState): number {
  let speed = otter.speedPerSec;
  if (otter.speedBoostMs > 0) speed *= FISH_SPEED_MULT;
  if (otter.carrying === 'stone') speed *= STONE_CARRY_SPEED_MULT;
  // P2-03: hand-linked rafts move faster the more otters are chained together.
  if (otter.raftLinks && otter.raftLinks > 0) {
    speed *= Math.min(1 + RAFT_SPEED_BONUS_PER_LINK * otter.raftLinks, RAFT_SPEED_BONUS_CAP);
  }
  return speed;
}

function heldItemOf(state: GameState, otterId: string): ItemState | undefined {
  return Object.values(state.items).find((i) => i.heldBy === otterId);
}

/** Action once the paws are empty again: keep walking or fall back to idle. */
function actionAfterHands(otter: OtterState): OtterState['action'] {
  return otter.vel.x !== 0 || otter.vel.y !== 0 ? 'walk' : 'idle';
}

/**
 * Stun an otter in place. Also knocks any hat off (it drops as a ground
 * cone item). Mutates the passed draft records; returns them for chaining.
 */
export function applyStun(
  otters: Record<string, OtterState>,
  items: Record<string, ItemState>,
  targetId: string,
  durationMs: number,
  cause: 'thrownFish' | 'pit',
  tick: number,
  events: GameEvent[],
): void {
  const target = otters[targetId];
  if (!target) return;
  otters[targetId] = {
    ...target,
    stunnedMs: Math.max(target.stunnedMs, durationMs),
    vel: { x: 0, y: 0 },
    wantsBuild: false,
    hat: null,
  };
  events.push({ type: 'otterStunned', playerId: targetId, durationMs, cause });
  if (target.hat !== null) {
    const itemId = `${target.hat}-${targetId}-t${tick}`;
    items[itemId] = { id: itemId, type: target.hat, pos: target.pos, heldBy: null };
    events.push({ type: 'hatKnockedOff', playerId: targetId, itemId });
    events.push({ type: 'itemSpawned', itemId, itemType: target.hat, pos: target.pos });
  }
}

/* ------------------------------------------------------------------ */

/** useItem command: eat a fish or wear a cone. */
export function applyUseItem(
  state: GameState,
  otter: OtterState,
  events: GameEvent[],
  reject: Reject,
): GameState {
  if (otter.carrying === null) {
    reject('nothingToUse');
    return state;
  }
  const held = heldItemOf(state, otter.id);
  if (!held) {
    reject('nothingToUse'); // carrying flag without a backing item = core bug
    return state;
  }

  switch (held.type) {
    case 'fish': {
      const items = { ...state.items };
      delete items[held.id];
      events.push({ type: 'itemEaten', playerId: otter.id, itemId: held.id, itemType: 'fish' });
      return {
        ...state,
        items,
        otters: {
          ...state.otters,
          [otter.id]: {
            ...otter,
            carrying: null,
            action: 'eat',
            actionMs: TRANSIENT_ACTION_HOLD_MS,
            speedBoostMs: FISH_BOOST_MS,
          },
        },
      };
    }
    case 'cone': {
      if (otter.hat !== null) {
        reject('alreadyWearingHat');
        return state;
      }
      const items = { ...state.items };
      delete items[held.id];
      events.push({ type: 'hatWorn', playerId: otter.id, hat: 'cone' });
      return {
        ...state,
        items,
        otters: {
          ...state.otters,
          [otter.id]: {
            ...otter,
            carrying: null,
            action: actionAfterHands(otter),
            hat: 'cone',
          },
        },
      };
    }
    default: {
      // branch/stone/dirt: build materials, nothing to "use" in place
      reject('noUseForItem');
      return state;
    }
  }
}

/** Distance from point p to segment a-b, plus the projection parameter t. */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): { d: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return { d: Math.hypot(p.x - cx, p.y - cy), t };
}

/**
 * throwItem command: the carried item flies THROW_DISTANCE in the facing
 * direction (clamped to the world) and lands on the ground. A fish that
 * passes within THROW_HIT_RADIUS of another otter smacks the first one on
 * its path: stun + hat knock-off, and the fish drops at their feet.
 */
export function applyThrow(
  state: GameState,
  otter: OtterState,
  events: GameEvent[],
  reject: Reject,
): GameState {
  if (otter.carrying === null) {
    reject('notCarrying');
    return state;
  }
  const held = heldItemOf(state, otter.id);
  if (!held) {
    reject('notCarrying');
    return state;
  }

  const dir = DIR_VECTORS[otter.facing];
  const from = otter.pos;
  let to: Vec2 = {
    x: Math.min(state.world.width, Math.max(0, from.x + dir.x * THROW_DISTANCE)),
    y: Math.min(state.world.height, Math.max(0, from.y + dir.y * THROW_DISTANCE)),
  };

  const otters: Record<string, OtterState> = { ...state.otters };
  const items: Record<string, ItemState> = { ...state.items };

  // Fish are the only stun projectile (v0.1 §4.2); everything else just lands.
  let victimId: string | null = null;
  if (held.type === 'fish') {
    let bestT = Infinity;
    for (const other of Object.values(state.otters)) {
      if (other.id === otter.id) continue;
      const { d, t } = distToSegment(other.pos, from, to);
      if (d <= THROW_HIT_RADIUS && t < bestT) {
        bestT = t;
        victimId = other.id;
      }
    }
  }

  if (victimId !== null) {
    const victim = state.otters[victimId];
    if (victim) to = victim.pos; // the fish stops where it hit
    applyStun(otters, items, victimId, THROWN_FISH_STUN_MS, 'thrownFish', state.tick, events);
  }

  // P2-13: a thrown fish crossing a hazard drives it off. The eagle releases
  // its captive freeze-free; the bear turns and leaves (a landed fish still
  // lures it away as before).
  let hazards = state.hazards;
  if (held.type === 'fish' && hazards) {
    let eagle = hazards.eagle;
    let bear = hazards.bear;
    let changed = false;
    if (eagle && (eagle.phase === 'swoop' || eagle.phase === 'carry')) {
      const { d } = distToSegment(eagle.pos, from, to);
      if (d <= THROW_HIT_RADIUS + 20) {
        const r = repelEagle({ ...state, otters }, eagle, otter.id, events);
        eagle = r.hazard;
        if (r.otters) Object.assign(otters, r.otters);
        changed = true;
      }
    }
    if (bear && bear.phase === 'approach') {
      const { d } = distToSegment(bear.pos, from, to);
      if (d <= THROW_HIT_RADIUS + 24) {
        bear = repelBear(bear, otter.id, events);
        changed = true;
      }
    }
    if (changed) hazards = { eagle, bear, schedule: hazards.schedule };
  }

  items[held.id] = { ...held, heldBy: null, pos: to };
  otters[otter.id] = { ...otter, carrying: null, action: actionAfterHands(otter) };
  events.push({
    type: 'itemThrown',
    playerId: otter.id,
    itemId: held.id,
    itemType: held.type,
    from,
    to,
  });
  return { ...state, otters, items, ...(hazards !== state.hazards ? { hazards } : {}) };
}

/**
 * dig command: instant. Spawns a dirt block (a 1-progress build material)
 * at the otter's feet and opens a pit there. The digger has a grace period;
 * after that even they can fall into their own hole (working as intended).
 */
export function applyDig(
  state: GameState,
  otter: OtterState,
  events: GameEvent[],
  reject: Reject,
): GameState {
  if (otter.carrying !== null) {
    reject('handsFull');
    return state;
  }
  const itemId = `dirt-${otter.id}-t${state.tick}`;
  const pitId = `pit-${otter.id}-t${state.tick}`;
  if (state.items[itemId]) {
    reject('alreadyDug'); // second dig in the same tick
    return state;
  }
  const pos = otter.pos;
  events.push({ type: 'dugDirt', playerId: otter.id, itemId, pos });
  events.push({ type: 'itemSpawned', itemId, itemType: 'dirt', pos });
  events.push({ type: 'pitCreated', pitId, pos });
  return {
    ...state,
    items: { ...state.items, [itemId]: { id: itemId, type: 'dirt', pos, heldBy: null } },
    pits: [
      ...state.pits,
      { id: pitId, pos, diggerId: otter.id, diggerImmuneMs: PIT_DIGGER_IMMUNE_MS },
    ],
  };
}
