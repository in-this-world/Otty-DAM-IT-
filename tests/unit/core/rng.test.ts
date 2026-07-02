import { describe, expect, it } from 'vitest';
import { mulberry32, rngStep } from '../../../src/core/rng';

describe('core/rng (mulberry32)', () => {
  it('same seed produces the same sequence', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('values are in [0, 1)', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rngStep is a pure function: same seed in, same {value, nextSeed} out', () => {
    const r1 = rngStep(999);
    const r2 = rngStep(999);
    expect(r1).toEqual(r2);
    expect(r1.nextSeed).not.toBe(999);
  });

  it('rngStep chains identically to mulberry32', () => {
    const rand = mulberry32(7);
    let seed = 7;
    for (let i = 0; i < 5; i++) {
      const step = rngStep(seed);
      expect(rand()).toBe(step.value);
      seed = step.nextSeed;
    }
  });
});
