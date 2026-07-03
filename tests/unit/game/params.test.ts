import { describe, expect, it } from 'vitest';
import { parseGameParams } from '../../../src/game/params';

describe('game/params (E2E test hooks)', () => {
  it('parses seed and freeze', () => {
    expect(parseGameParams('?seed=42&freeze=1')).toEqual({ seed: 42, freeze: true });
    expect(parseGameParams('?freeze=true')).toEqual({ seed: null, freeze: true });
  });

  it('defaults to live play on missing/garbage params', () => {
    expect(parseGameParams('')).toEqual({ seed: null, freeze: false });
    expect(parseGameParams('?seed=banana&freeze=0')).toEqual({ seed: null, freeze: false });
    expect(parseGameParams('?seed=-5')).toEqual({ seed: null, freeze: false });
  });
});
