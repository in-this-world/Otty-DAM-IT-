/**
 * P3-02 client-view smoothing: interpolation (remotes) + extrapolation
 * (local prediction) primitives, and the SnapshotBuffer sampler.
 */
import { describe, expect, it } from 'vitest';
import { applyMove, movementSystem } from '../../../src/core/movement';
import { createInitialState } from '../../../src/core/state';
import type { GameState } from '../../../src/core/types';
import {
  extrapolateOtter,
  interpolateSnapshots,
  lerp,
  SnapshotBuffer,
} from '../../../src/net/interpolation';

const WORLD = { width: 1000, height: 800 };

function stateWithOtterAt(x: number, y: number): GameState {
  const s = createInitialState({ playerCount: 1, seed: 1, world: WORLD });
  return { ...s, otters: { 'otter-1': { ...s.otters['otter-1']!, pos: { x, y } } } };
}

describe('interpolation (P3-02)', () => {
  it('lerps scalars and otter positions at t', () => {
    expect(lerp(0, 100, 0.25)).toBe(25);
    const a = stateWithOtterAt(0, 0);
    const b = stateWithOtterAt(100, 200);
    const mid = interpolateSnapshots(a, b, 0.5);
    expect(mid.otters['otter-1']!.pos).toEqual({ x: 50, y: 100 });
  });

  it('clamps t and returns endpoints by reference', () => {
    const a = stateWithOtterAt(0, 0);
    const b = stateWithOtterAt(100, 0);
    expect(interpolateSnapshots(a, b, -1)).toBe(a);
    expect(interpolateSnapshots(a, b, 2)).toBe(b);
  });

  it('takes discrete fields (dam/phase) from the newer snapshot', () => {
    const a = stateWithOtterAt(0, 0);
    const b: GameState = { ...stateWithOtterAt(100, 0), dam: { ...a.dam, progress: 7 } };
    expect(interpolateSnapshots(a, b, 0.5).dam.progress).toBe(7);
  });

  it('extrapolateOtter matches movementSystem integration exactly', () => {
    const base = createInitialState({ playerCount: 1, seed: 5, world: WORLD });
    const moving = applyMove(base, base.otters['otter-1']!, 'right');
    const viaSystem = movementSystem(moving, 50, [])!;
    const viaExtrap = extrapolateOtter(moving.otters['otter-1']!, WORLD, 50);
    expect(viaExtrap.pos).toEqual(viaSystem.otters['otter-1']!.pos);
  });

  it('does not move a stationary or stunned otter', () => {
    const s = createInitialState({ playerCount: 1, seed: 5, world: WORLD });
    const still = s.otters['otter-1']!;
    expect(extrapolateOtter(still, WORLD, 50)).toBe(still);
  });
});

describe('SnapshotBuffer (P3-02)', () => {
  it('interpolates between the two snapshots bracketing the delayed clock', () => {
    const buf = new SnapshotBuffer(0); // no delay -> sample at `now`
    buf.push(stateWithOtterAt(0, 0), 0);
    buf.push(stateWithOtterAt(100, 0), 100);
    const s = buf.sample(50)!;
    expect(s.otters['otter-1']!.pos.x).toBeCloseTo(50, 5);
  });

  it('returns the newest snapshot when the clock is past history', () => {
    const buf = new SnapshotBuffer(0);
    buf.push(stateWithOtterAt(0, 0), 0);
    buf.push(stateWithOtterAt(100, 0), 100);
    expect(buf.sample(999)!.otters['otter-1']!.pos.x).toBe(100);
    expect(buf.size()).toBe(2);
  });
});
