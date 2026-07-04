/**
 * P2-06: pure joystick math for the mobile virtual stick.
 */
import { describe, expect, it } from 'vitest';
import { clampKnob, joystickDirections, NO_DIRS } from '../../../src/game/touch';

describe('P2-06 touch: clampKnob', () => {
  it('passes short offsets through unchanged', () => {
    expect(clampKnob(3, -4, 50)).toEqual({ dx: 3, dy: -4 }); // len 5 <= 50
  });
  it('clamps long offsets to the radius ring', () => {
    const k = clampKnob(300, 0, 50);
    expect(k).toEqual({ dx: 50, dy: 0 });
  });
  it('handles the zero offset', () => {
    expect(clampKnob(0, 0, 50)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('P2-06 touch: joystickDirections', () => {
  const R = 60; // dead = 21
  it('reports nothing inside the deadzone', () => {
    expect(joystickDirections(10, -10, R)).toEqual(NO_DIRS); // len ~14 < 21
  });
  it('pushing up (screen dy negative) -> up only', () => {
    expect(joystickDirections(0, -R, R)).toEqual({ up: true, down: false, left: false, right: false });
  });
  it('pushing down -> down only', () => {
    expect(joystickDirections(0, R, R)).toEqual({ up: false, down: true, left: false, right: false });
  });
  it('pushing left -> left only', () => {
    expect(joystickDirections(-R, 0, R)).toEqual({ up: false, down: false, left: true, right: false });
  });
  it('pushing right -> right only', () => {
    expect(joystickDirections(R, 0, R)).toEqual({ up: false, down: false, left: false, right: true });
  });
  it('a corner push reports both axes (diagonal)', () => {
    const d = joystickDirections(R * 0.8, -R * 0.8, R); // 48 each > 21
    expect(d).toEqual({ up: true, down: false, left: false, right: true });
  });
  it('respects a custom deadzone fraction', () => {
    // half-radius push with a 0.6 deadzone -> below threshold (0.5 < 0.6)
    expect(joystickDirections(0, -R * 0.5, R, 0.6)).toEqual(NO_DIRS);
  });
});
