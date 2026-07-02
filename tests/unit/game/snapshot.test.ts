/**
 * P1-07: window.__otty snapshot shape (the E2E contract).
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
});
