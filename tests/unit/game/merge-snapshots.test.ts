/**
 * P2-06: OR-merge of keyboard + touch input snapshots.
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT, mergeSnapshots } from '../../../src/game/input';

describe('P2-06 mergeSnapshots', () => {
  it('is identity when the second source is empty', () => {
    const kb = { ...EMPTY_SNAPSHOT, up: true, build: true };
    expect(mergeSnapshots(kb, {})).toEqual(kb);
  });
  it('ORs a partial touch snapshot into the keyboard one', () => {
    const merged = mergeSnapshots({ ...EMPTY_SNAPSHOT, up: true }, { right: true, poke: true });
    expect(merged.up).toBe(true);
    expect(merged.right).toBe(true);
    expect(merged.poke).toBe(true);
    expect(merged.down).toBe(false);
  });
  it('either source down => held', () => {
    const merged = mergeSnapshots({ ...EMPTY_SNAPSHOT, interact: true }, { interact: true });
    expect(merged.interact).toBe(true);
  });
});
