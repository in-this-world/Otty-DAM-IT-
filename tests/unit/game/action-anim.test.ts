import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/core/types';
import { transientAnimForEvent } from '../../../src/game/action-anim';

describe('transientAnimForEvent', () => {
  it('maps itemThrown to otter-throw / 350ms', () => {
    const ev: GameEvent = {
      type: 'itemThrown',
      playerId: 'p1',
      itemId: 'i1',
      itemType: 'stone',
      from: { x: 0, y: 0 },
      to: { x: 10, y: 0 },
    };
    expect(transientAnimForEvent(ev)).toEqual({
      otterId: 'p1',
      animKey: 'otter-throw',
      durationMs: 350,
    });
  });

  it('maps dugDirt to otter-dig / 500ms', () => {
    const ev: GameEvent = {
      type: 'dugDirt',
      playerId: 'p2',
      itemId: 'i2',
      pos: { x: 5, y: 5 },
    };
    expect(transientAnimForEvent(ev)).toEqual({
      otterId: 'p2',
      animKey: 'otter-dig',
      durationMs: 500,
    });
  });

  it('maps itemPickedUp of a stone to otter-pick_stone / 400ms', () => {
    const ev: GameEvent = {
      type: 'itemPickedUp',
      playerId: 'p3',
      itemId: 'i3',
      itemType: 'stone',
    };
    expect(transientAnimForEvent(ev)).toEqual({
      otterId: 'p3',
      animKey: 'otter-pick_stone',
      durationMs: 400,
    });
  });

  it('returns null for itemPickedUp of a non-stone item', () => {
    const ev: GameEvent = {
      type: 'itemPickedUp',
      playerId: 'p3',
      itemId: 'i4',
      itemType: 'branch',
    };
    expect(transientAnimForEvent(ev)).toBeNull();
  });

  it('maps debuffWashedOff to otter-wash / 600ms', () => {
    const ev: GameEvent = { type: 'debuffWashedOff', playerId: 'p4' };
    expect(transientAnimForEvent(ev)).toEqual({
      otterId: 'p4',
      animKey: 'otter-wash',
      durationMs: 600,
    });
  });

  it('returns null for an unrelated event (otterMoved)', () => {
    const ev: GameEvent = { type: 'otterMoved', playerId: 'p5', dir: 'left' };
    expect(transientAnimForEvent(ev)).toBeNull();
  });
});
