/**
 * URL test hooks (pure, unit-tested):
 *   ?seed=<uint>  fixed RNG seed -> deterministic branch layout
 *   ?freeze=1     don't start the sim clock + pause all animations
 * Both exist for visual-regression E2E (stable screenshots); normal play
 * uses neither.
 */
export interface GameParams {
  readonly seed: number | null;
  readonly freeze: boolean;
}

export function parseGameParams(search: string): GameParams {
  const params = new URLSearchParams(search);
  const rawSeed = params.get('seed');
  const parsed = rawSeed === null ? Number.NaN : Number.parseInt(rawSeed, 10);
  const freezeRaw = params.get('freeze');
  return {
    seed: Number.isFinite(parsed) && parsed >= 0 ? parsed >>> 0 : null,
    freeze: freezeRaw === '1' || freezeRaw === 'true',
  };
}
