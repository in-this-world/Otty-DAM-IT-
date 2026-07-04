/**
 * P2-06 mobile touch input — PURE module (zero Phaser imports).
 *
 * The virtual joystick reports a raw offset (dx,dy) of the knob from its base;
 * this module turns that into the same directional booleans the keyboard path
 * produces, so both feed the one tested `deriveCommands` pipeline (input.ts).
 * Kept pure so the joystick math is unit-tested headlessly like input.ts.
 */
import type { InputSnapshot } from './input';

export interface Knob {
  readonly dx: number;
  readonly dy: number;
}

export type DirInputs = Pick<InputSnapshot, 'up' | 'down' | 'left' | 'right'>;

export const NO_DIRS: DirInputs = { up: false, down: false, left: false, right: false };

/** Fraction of the base radius the knob must leave before any direction fires. */
export const DEFAULT_DEADZONE_FRAC = 0.35;

/**
 * Clamp a raw knob offset to within `radius` (for rendering the knob so it
 * never leaves its base ring). Zero/short offsets pass through unchanged.
 */
export function clampKnob(dx: number, dy: number, radius: number): Knob {
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return { dx, dy };
  return { dx: (dx / len) * radius, dy: (dy / len) * radius };
}

/**
 * Directions from a joystick offset. Screen Y grows downward, so dy<0 = up.
 * An axis fires when its component magnitude exceeds the deadzone, so a
 * diagonal push reports both axes; `deriveCommands` then applies priority +
 * hysteresis. Inside the deadzone nothing fires (prevents centre jitter).
 */
export function joystickDirections(
  dx: number,
  dy: number,
  radius: number,
  deadzoneFrac: number = DEFAULT_DEADZONE_FRAC,
): DirInputs {
  const dead = radius * deadzoneFrac;
  if (Math.hypot(dx, dy) < dead) return NO_DIRS;
  return {
    up: dy <= -dead,
    down: dy >= dead,
    left: dx <= -dead,
    right: dx >= dead,
  };
}
