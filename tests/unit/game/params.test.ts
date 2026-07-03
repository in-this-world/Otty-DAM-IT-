import { describe, expect, it } from 'vitest';
import {
  parseGameParams,
  REQUIRED_MAX,
  REQUIRED_MIN,
  AI_MAX,
  AI_MIN,
  TIMER_MAX_MS,
  TIMER_MIN_MS,
} from '../../../src/game/params';

const DEFAULTS = { seed: null, freeze: false, timer: null, required: null, ai: null };

describe('game/params (E2E test hooks)', () => {
  it('parses seed and freeze', () => {
    expect(parseGameParams('?seed=42&freeze=1')).toEqual({ ...DEFAULTS, seed: 42, freeze: true });
    expect(parseGameParams('?freeze=true')).toEqual({ ...DEFAULTS, freeze: true });
  });

  it('defaults to live play on missing/garbage params', () => {
    expect(parseGameParams('')).toEqual(DEFAULTS);
    expect(parseGameParams('?seed=banana&freeze=0')).toEqual(DEFAULTS);
    expect(parseGameParams('?seed=-5')).toEqual(DEFAULTS);
  });

  it('parses timer override in ms (P1-08)', () => {
    expect(parseGameParams('?timer=3000')).toEqual({ ...DEFAULTS, timer: 3000 });
    expect(parseGameParams('?timer=120000')).toEqual({ ...DEFAULTS, timer: 120_000 });
  });

  it('clamps timer to 1s..10min and rejects garbage', () => {
    expect(parseGameParams('?timer=5').timer).toBe(TIMER_MIN_MS);
    expect(parseGameParams('?timer=999999999').timer).toBe(TIMER_MAX_MS);
    expect(parseGameParams('?timer=-1').timer).toBe(TIMER_MIN_MS);
    expect(parseGameParams('?timer=soon').timer).toBeNull();
    expect(parseGameParams('').timer).toBeNull();
  });

  it('parses required (damRequiredPerPlayer) override (P1-08)', () => {
    expect(parseGameParams('?required=3')).toEqual({ ...DEFAULTS, required: 3 });
  });

  it('clamps required to 1..100 and rejects garbage', () => {
    expect(parseGameParams('?required=0').required).toBe(REQUIRED_MIN);
    expect(parseGameParams('?required=-7').required).toBe(REQUIRED_MIN);
    expect(parseGameParams('?required=5000').required).toBe(REQUIRED_MAX);
    expect(parseGameParams('?required=lots').required).toBeNull();
    expect(parseGameParams('').required).toBeNull();
  });

  it('combines all hooks independently', () => {
    expect(parseGameParams('?seed=1&required=3&timer=120000')).toEqual({
      seed: 1,
      freeze: false,
      timer: 120_000,
      required: 3,
      ai: null,
    });
  });

  it('parses ai count and clamps to 0..8 (P2-05 wiring)', () => {
    expect(parseGameParams('?ai=2')).toEqual({ ...DEFAULTS, ai: 2 });
    expect(parseGameParams('?ai=0').ai).toBe(AI_MIN);
    expect(parseGameParams('?ai=99').ai).toBe(AI_MAX);
    expect(parseGameParams('?ai=-3').ai).toBe(AI_MIN);
    expect(parseGameParams('?ai=lots').ai).toBeNull();
    expect(parseGameParams('').ai).toBeNull();
  });
});
