/**
 * P1-07: HUD formatting helpers.
 */
import { describe, expect, it } from 'vitest';
import { formatTime, progressRatio } from '../../../src/game/scenes/ui/format';

describe('game/ui/format (P1-07)', () => {
  it('formats a fresh 4-minute timer and counts seconds up (ceil)', () => {
    expect(formatTime(240_000)).toBe('04:00');
    expect(formatTime(239_999)).toBe('04:00');
    expect(formatTime(61_000)).toBe('01:01');
    expect(formatTime(1)).toBe('00:01');
  });

  it('clamps zero/negative/invalid time to 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(-500)).toBe('00:00');
    expect(formatTime(Number.NaN)).toBe('00:00');
  });

  it('progressRatio clamps to [0,1] and treats required<=0 as complete', () => {
    expect(progressRatio(10, 20)).toBe(0.5);
    expect(progressRatio(25, 20)).toBe(1);
    expect(progressRatio(-5, 20)).toBe(0);
    expect(progressRatio(0, 0)).toBe(1);
    expect(progressRatio(Number.NaN, 20)).toBe(0);
  });
});
