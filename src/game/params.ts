/**
 * URL test hooks (pure, unit-tested):
 *   ?seed=<uint>     fixed RNG seed -> deterministic branch layout
 *   ?freeze=1        don't start the sim clock + pause all animations
 *   ?timer=<ms>      override round length, clamped to 1s..10min (P1-08)
 *   ?required=<n>    override damRequiredPerPlayer, clamped to 1..100 (P1-08)
 *   ?ai=<n>          number of AI otters (0..8); default = fill party (P2-05)
 *   ?aiSpeed=<pct>   AI move speed as %% of normal (10..100); default 55 (P2-05)
 *   ?hazards=0       disable eagle/bear sudden events (E2E determinism); on by default (P2-06)
 * All exist for E2E (stable screenshots / short win-lose rounds); normal
 * play uses none of them.
 */
export interface GameParams {
  readonly seed: number | null;
  readonly freeze: boolean;
  /** Round length override in ms, or null to use the scene default. */
  readonly timer: number | null;
  /** damRequiredPerPlayer override, or null to use the core default. */
  readonly required: number | null;
  /** AI-otter count override (0..8), or null to use the scene default. */
  readonly ai: number | null;
  /** AI speed as a percent of normal (10..100), or null for scene default. */
  readonly aiSpeed: number | null;
  /** Eagle/bear sudden events (P2-06). Default true; ?hazards=0 disables. */
  readonly hazards: boolean;
}

export const TIMER_MIN_MS = 1_000;
export const TIMER_MAX_MS = 600_000;
export const REQUIRED_MIN = 1;
export const REQUIRED_MAX = 100;
export const AI_MIN = 0;
export const AI_MAX = 8;
export const AI_SPEED_MIN = 10;
export const AI_SPEED_MAX = 100;

/** Parse an integer param; garbage -> null, out-of-range -> clamped. */
function clampedInt(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

export function parseGameParams(search: string): GameParams {
  const params = new URLSearchParams(search);
  const rawSeed = params.get('seed');
  const parsed = rawSeed === null ? Number.NaN : Number.parseInt(rawSeed, 10);
  const freezeRaw = params.get('freeze');
  return {
    seed: Number.isFinite(parsed) && parsed >= 0 ? parsed >>> 0 : null,
    freeze: freezeRaw === '1' || freezeRaw === 'true',
    timer: clampedInt(params.get('timer'), TIMER_MIN_MS, TIMER_MAX_MS),
    required: clampedInt(params.get('required'), REQUIRED_MIN, REQUIRED_MAX),
    ai: clampedInt(params.get('ai'), AI_MIN, AI_MAX),
    aiSpeed: clampedInt(params.get('aiSpeed'), AI_SPEED_MIN, AI_SPEED_MAX),
    hazards: params.get('hazards') !== '0' && params.get('hazards') !== 'false',
  };
}
