/**
 * Pure mapping: core GameEvent -> a transient otter animation the game layer
 * should play briefly on that otter's sprite, then fall back to its normal
 * (base action) animation once the duration elapses.
 *
 * Zero Phaser imports: the game layer subscribes to adapter.onEvents, keeps a
 * per-otter { animKey, remainingMs } override, counts it down each frame, and
 * plays the override on top of the base action but below win/lose/dizzy.
 */
import type { GameEvent } from '../core/types';

export interface TransientAnim {
  readonly otterId: string;
  /** Registered Phaser animation key (all prefixed `otter-`). */
  readonly animKey: string;
  readonly durationMs: number;
}

/** Map an event to a transient anim override, or null if it triggers none. */
export function transientAnimForEvent(event: GameEvent): TransientAnim | null {
  switch (event.type) {
    case 'itemThrown':
      return { otterId: event.playerId, animKey: 'otter-throw', durationMs: 350 };
    case 'dugDirt':
      return { otterId: event.playerId, animKey: 'otter-dig', durationMs: 500 };
    case 'itemPickedUp':
      if (event.itemType === 'stone') {
        return { otterId: event.playerId, animKey: 'otter-pick_stone', durationMs: 400 };
      }
      return null;
    case 'debuffWashedOff':
      return { otterId: event.playerId, animKey: 'otter-wash', durationMs: 600 };
    default:
      return null;
  }
}
