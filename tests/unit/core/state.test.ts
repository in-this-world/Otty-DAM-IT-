import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  DEFAULT_DAM_REQUIRED_PER_PLAYER,
  DEFAULT_TIMER_MS,
  DEFAULT_WORLD,
} from '../../../src/core/state';
import { requiredProgress } from '../../../src/core/dam';

describe('core/state createInitialState', () => {
  it('is deterministic: same config -> deep-equal state', () => {
    const a = createInitialState({ playerCount: 4, seed: 123 });
    const b = createInitialState({ playerCount: 4, seed: 123 });
    expect(a).toEqual(b);
  });

  it('different seeds -> different states', () => {
    const a = createInitialState({ playerCount: 4, seed: 1 });
    const b = createInitialState({ playerCount: 4, seed: 2 });
    expect(a).not.toEqual(b);
    expect(a.rngSeed).not.toBe(b.rngSeed);
  });

  it('has the expected P0 shape', () => {
    const s = createInitialState({ playerCount: 3, seed: 42 });
    expect(s.tick).toBe(0);
    expect(s.phase).toBe('playing');
    expect(s.timerMs).toBe(DEFAULT_TIMER_MS);
    expect(s.dam.progress).toBe(0);
    expect(s.dam.required).toBe(requiredProgress(3, DEFAULT_DAM_REQUIRED_PER_PLAYER));
    expect(Object.keys(s.otters)).toHaveLength(3);
    // default rounds scatter 2x required progress in items (P2-01 mix:
    // mostly branches, a sprinkle of fish and stones) so the round is winnable
    expect(Object.keys(s.items)).toHaveLength(Math.ceil(s.dam.required * 2));
    const byType = { branch: 0, fish: 0, stone: 0, cone: 0, dirt: 0 };
    for (const item of Object.values(s.items)) {
      byType[item.type] += 1;
      expect(item.heldBy).toBeNull();
    }
    expect(byType.branch).toBeGreaterThan(Object.keys(s.items).length / 2);
    expect(byType.fish).toBeGreaterThanOrEqual(1);
    expect(byType.stone).toBeGreaterThanOrEqual(1);
    expect(byType.cone).toBe(0);
    expect(byType.dirt).toBe(0);
    expect(s.pits).toEqual([]);
  });

  it('spawns otters idle, empty-handed, inside the world bounds', () => {
    const s = createInitialState({ playerCount: 5, seed: 7 });
    for (const otter of Object.values(s.otters)) {
      expect(otter.action).toBe('idle');
      expect(otter.carrying).toBeNull();
      expect(otter.stunnedMs).toBe(0);
      expect(otter.speedBoostMs).toBe(0);
      expect(otter.hat).toBeNull();
      expect(otter.score).toBe(0);
      expect(otter.pos.x).toBeGreaterThanOrEqual(0);
      expect(otter.pos.x).toBeLessThanOrEqual(DEFAULT_WORLD.width);
      expect(otter.pos.y).toBeGreaterThanOrEqual(0);
      expect(otter.pos.y).toBeLessThanOrEqual(DEFAULT_WORLD.height);
    }
  });

  it('honors config overrides (timerMs, phase, damRequiredPerPlayer)', () => {
    const s = createInitialState({
      playerCount: 2,
      seed: 1,
      timerMs: 60_000,
      phase: 'lobby',
      damRequiredPerPlayer: 50,
    });
    expect(s.timerMs).toBe(60_000);
    expect(s.phase).toBe('lobby');
    expect(s.dam.required).toBe(requiredProgress(2, 50));
  });

  it('clamps playerCount to the supported 1..10 range', () => {
    expect(Object.keys(createInitialState({ playerCount: 0, seed: 1 }).otters)).toHaveLength(1);
    expect(Object.keys(createInitialState({ playerCount: 99, seed: 1 }).otters)).toHaveLength(10);
  });
});
