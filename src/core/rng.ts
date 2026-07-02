/**
 * Deterministic RNG (mulberry32). Two forms of the same generator:
 *
 * - rngStep(seed): pure single step, for use inside the reducer where the
 *   seed lives in GameState.rngSeed (replay/lockstep-safe, P3-ready).
 * - mulberry32(seed): stateful convenience wrapper for one-shot setup code
 *   such as createInitialState.
 */

export interface RngStepResult {
  /** Uniform float in [0, 1). */
  readonly value: number;
  /** Seed to store for the next step. */
  readonly nextSeed: number;
}

/** One mulberry32 step as a pure function: same seed in, same result out. */
export function rngStep(seed: number): RngStepResult {
  const nextSeed = (seed + 0x6d2b79f5) >>> 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextSeed };
}

/** Stateful generator over rngStep. Same seed -> same sequence. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    const { value, nextSeed } = rngStep(s);
    s = nextSeed;
    return value;
  };
}
