/**
 * P1-07: window.__otty snapshot shape (the E2E contract).
 * P1-08 adds `items` (ground-item positions) for the full-round bot.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../../src/core/state';
import { buildSnapshot } from '../../../src/game/snapshot';

describe('game/snapshot (P1-07)', () => {
  it('mirrors the sim state and counts only free items', () => {
    const state = createInitialState({
      playerCount: 2,
      seed: 4,
      items: [
        { id: 'a', type: 'branch', pos: { x: 1, y: 2 } },
        { id: 'b', type: 'fish', pos: { x: 3, y: 4 } },
      ],
    });
    const snap = buildSnapshot(state);
    expect(snap.ready).toBe(true);
    expect(snap.phase).toBe('playing');
    expect(snap.tick).toBe(0);
    expect(snap.timerMs).toBe(state.timerMs);
    expect(snap.dam).toEqual({ progress: 0, required: state.dam.required });
    expect(Object.keys(snap.otters)).toHaveLength(2);
    expect(snap.itemsOnGround).toBe(2);

    const held = {
      ...state,
      items: { ...state.items, a: { ...state.items['a']!, heldBy: 'otter-1' } },
    };
    expect(buildSnapshot(held).itemsOnGround).toBe(1);
  });

  it('exposes ground-item positions and hides held items (P1-08)', () => {
    const state = createInitialState({
      playerCount: 1,
      seed: 4,
      items: [
        { id: 'a', type: 'branch', pos: { x: 10, y: 20 } },
        { id: 'b', type: 'fish', pos: { x: 30, y: 40 } },
      ],
    });
    const snap = buildSnapshot(state);
    expect(snap.items).toEqual(
      expect.arrayContaining([
        { id: 'a', x: 10, y: 20, type: 'branch' },
        { id: 'b', x: 30, y: 40, type: 'fish' },
      ]),
    );
    expect(snap.items).toHaveLength(2);
    expect(snap.itemsOnGround).toBe(snap.items.length);

    const held = {
      ...state,
      items: { ...state.items, a: { ...state.items['a']!, heldBy: 'otter-1' } },
    };
    const heldSnap = buildSnapshot(held);
    expect(heldSnap.items).toEqual([{ id: 'b', x: 30, y: 40, type: 'fish' }]);
    expect(heldSnap.itemsOnGround).toBe(1);
  });
});
