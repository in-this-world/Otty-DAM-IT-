/**
 * P1-02: pick up / drop items.
 *
 * pickUp: nearest free item within PICKUP_RADIUS (or a specific itemId);
 * requires empty paws and an unheld item. drop: lands at the otter's feet.
 * Both are command handlers invoked from tick.ts.
 */
import type { GameEvent, GameState, ItemState, OtterState } from './types';

/** Max distance (world units) at which an otter can grab an item. */
export const PICKUP_RADIUS = 48;

type Reject = (reason: string) => void;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function take(
  state: GameState,
  otter: OtterState,
  item: ItemState,
  events: GameEvent[],
): GameState {
  events.push({
    type: 'itemPickedUp',
    playerId: otter.id,
    itemId: item.id,
    itemType: item.type,
  });
  return {
    ...state,
    otters: {
      ...state.otters,
      [otter.id]: { ...otter, carrying: item.type, action: 'carry' },
    },
    items: { ...state.items, [item.id]: { ...item, heldBy: otter.id } },
  };
}

export function applyPickUp(
  state: GameState,
  otter: OtterState,
  itemId: string | undefined,
  events: GameEvent[],
  reject: Reject,
): GameState {
  if (otter.carrying !== null) {
    reject('handsFull');
    return state;
  }

  if (itemId !== undefined) {
    const item = state.items[itemId];
    if (!item) {
      reject('noSuchItem');
      return state;
    }
    if (item.heldBy !== null) {
      reject('itemUnavailable');
      return state;
    }
    if (dist(item.pos, otter.pos) > PICKUP_RADIUS) {
      reject('noItemInRange');
      return state;
    }
    return take(state, otter, item, events);
  }

  let best: ItemState | null = null;
  let bestDist = Infinity;
  for (const item of Object.values(state.items)) {
    if (item.heldBy !== null) continue;
    const d = dist(item.pos, otter.pos);
    if (d <= PICKUP_RADIUS && d < bestDist) {
      best = item;
      bestDist = d;
    }
  }
  if (!best) {
    reject('noItemInRange');
    return state;
  }
  return take(state, otter, best, events);
}

export function applyDrop(
  state: GameState,
  otter: OtterState,
  events: GameEvent[],
  reject: Reject,
): GameState {
  if (otter.carrying === null) {
    reject('notCarrying');
    return state;
  }
  const held = Object.values(state.items).find((i) => i.heldBy === otter.id);
  if (!held) {
    // carrying flag without a backing item would be a core bug
    reject('notCarrying');
    return state;
  }
  events.push({
    type: 'itemDropped',
    playerId: otter.id,
    itemId: held.id,
    itemType: held.type,
  });
  return {
    ...state,
    otters: {
      ...state.otters,
      // Dropping halts the otter for the tick so the item lands exactly at
      // its feet (movement runs after commands each tick).
      [otter.id]: { ...otter, carrying: null, action: 'idle', vel: { x: 0, y: 0 } },
    },
    items: { ...state.items, [held.id]: { ...held, heldBy: null, pos: otter.pos } },
  };
}
