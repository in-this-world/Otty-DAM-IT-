/**
 * P1-02: pick up / drop items.
 * pickUp requires: within PICKUP_RADIUS, empty paws, item not held by anyone.
 * drop places the item at the otter's current position.
 */
import { describe, expect, it } from 'vitest';
import { PICKUP_RADIUS } from '../../../src/core/inventory';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameState, ItemState, OtterState } from '../../../src/core/types';

const TICK_MS = 50;
const WORLD = { width: 1000, height: 800 };

function setup(): GameState {
  const s = createInitialState({
    playerCount: 2,
    seed: 1,
    world: WORLD,
    items: [
      { id: 'b1', type: 'branch', pos: { x: 100, y: 100 } },
      { id: 'b2', type: 'branch', pos: { x: 130, y: 100 } },
      { id: 'f1', type: 'fish', pos: { x: 700, y: 700 } },
    ],
  });
  return placeOtter(placeOtter(s, 'otter-1', 110, 100), 'otter-2', 900, 100);
}

function placeOtter(s: GameState, id: string, x: number, y: number): GameState {
  const o = s.otters[id];
  if (!o) throw new Error(`missing otter ${id}`);
  return { ...s, otters: { ...s.otters, [id]: { ...o, pos: { x, y } } } };
}

function otter(s: GameState, id: string): OtterState {
  const o = s.otters[id];
  if (!o) throw new Error(`missing otter ${id}`);
  return o;
}

function item(s: GameState, id: string): ItemState {
  const i = s.items[id];
  if (!i) throw new Error(`missing item ${id}`);
  return i;
}

describe('core/inventory (P1-02)', () => {
  it('exposes a sane pickup radius', () => {
    expect(PICKUP_RADIUS).toBeGreaterThan(0);
  });

  it('picks up the nearest free item in range', () => {
    const { state, events } = reduce(setup(), [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS);
    // b1 is 10 units away, b2 is 20 -> picks b1
    expect(events).toContainEqual({
      type: 'itemPickedUp',
      playerId: 'otter-1',
      itemId: 'b1',
      itemType: 'branch',
    });
    expect(otter(state, 'otter-1').carrying).toBe('branch');
    expect(otter(state, 'otter-1').action).toBe('carry');
    expect(item(state, 'b1').heldBy).toBe('otter-1');
  });

  it('picks up a specific item by id when requested', () => {
    const { state } = reduce(
      setup(),
      [{ type: 'pickUp', playerId: 'otter-1', itemId: 'b2' }],
      TICK_MS,
    );
    expect(item(state, 'b2').heldBy).toBe('otter-1');
    expect(item(state, 'b1').heldBy).toBeNull();
  });

  it('rejects pickUp when the item is out of range', () => {
    const { state, events } = reduce(setup(), [{ type: 'pickUp', playerId: 'otter-2' }], TICK_MS);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-2',
      command: 'pickUp',
      reason: 'noItemInRange',
    });
    expect(otter(state, 'otter-2').carrying).toBeNull();
  });

  it('rejects pickUp when paws are already full', () => {
    const first = reduce(setup(), [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS).state;
    const { events } = reduce(
      first,
      [{ type: 'pickUp', playerId: 'otter-1', itemId: 'b2' }],
      TICK_MS,
    );
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-1',
      command: 'pickUp',
      reason: 'handsFull',
    });
  });

  it('rejects pickUp of an item held by someone else', () => {
    let s = reduce(setup(), [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS).state; // holds b1
    s = placeOtter(s, 'otter-2', 100, 100);
    const { events } = reduce(
      s,
      [{ type: 'pickUp', playerId: 'otter-2', itemId: 'b1' }],
      TICK_MS,
    );
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-2',
      command: 'pickUp',
      reason: 'itemUnavailable',
    });
  });

  it('a nearby held item is skipped in favor of the nearest free one', () => {
    let s = reduce(setup(), [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS).state; // b1 taken
    s = placeOtter(s, 'otter-2', 100, 100); // b1 at distance 0, b2 at 30
    const { state, events } = reduce(s, [{ type: 'pickUp', playerId: 'otter-2' }], TICK_MS);
    expect(events).toContainEqual({
      type: 'itemPickedUp',
      playerId: 'otter-2',
      itemId: 'b2',
      itemType: 'branch',
    });
    expect(item(state, 'b2').heldBy).toBe('otter-2');
  });

  it('rejects pickUp of an unknown item id', () => {
    const { events } = reduce(
      setup(),
      [{ type: 'pickUp', playerId: 'otter-1', itemId: 'ghost-item' }],
      TICK_MS,
    );
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-1',
      command: 'pickUp',
      reason: 'noSuchItem',
    });
  });

  it('drop lands the item at the otter position and frees the paws', () => {
    let s = reduce(setup(), [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS).state;
    // walk right for a few ticks so drop position differs from pickup position
    ({ state: s } = reduce(s, [{ type: 'move', playerId: 'otter-1', dir: 'right' }], TICK_MS));
    for (let i = 0; i < 4; i++) ({ state: s } = reduce(s, [], TICK_MS));
    const { state, events } = reduce(s, [{ type: 'drop', playerId: 'otter-1' }], TICK_MS);
    const o = otter(state, 'otter-1');
    expect(o.carrying).toBeNull();
    expect(item(state, 'b1').heldBy).toBeNull();
    expect(item(state, 'b1').pos).toEqual(o.pos);
    expect(events).toContainEqual({
      type: 'itemDropped',
      playerId: 'otter-1',
      itemId: 'b1',
      itemType: 'branch',
    });
  });

  it('rejects drop when carrying nothing', () => {
    const { events } = reduce(setup(), [{ type: 'drop', playerId: 'otter-1' }], TICK_MS);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-1',
      command: 'drop',
      reason: 'notCarrying',
    });
  });

  it('keeps the carry action while walking with an item', () => {
    let s = reduce(setup(), [{ type: 'pickUp', playerId: 'otter-1' }], TICK_MS).state;
    ({ state: s } = reduce(s, [{ type: 'move', playerId: 'otter-1', dir: 'left' }], TICK_MS));
    expect(otter(s, 'otter-1').action).toBe('carry');
    ({ state: s } = reduce(s, [{ type: 'stop', playerId: 'otter-1' }], TICK_MS));
    expect(otter(s, 'otter-1').action).toBe('carry');
  });
});
