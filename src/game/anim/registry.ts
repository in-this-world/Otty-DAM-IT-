/**
 * P1-06 animation registry — PURE module (zero Phaser imports).
 *
 * public/assets/animations.json (built by P0-03) is the single source of
 * truth for animation clips. BootScene loads it in preload() and calls
 * registerAnimations(this.anims, manifest, 'otter') in create().
 *
 * Phaser's AnimationManager is only used through the structural
 * AnimationRegistrar interface, so everything here runs under Vitest/node.
 */
import type { OtterAction } from '../../core/types';

/**
 * Record<OtterAction, true> forces this table to stay in sync with the core
 * union: adding/removing an action in core/types.ts breaks compilation here.
 */
const ACTION_SET: Record<OtterAction, true> = {
  idle: true,
  walk: true,
  carry: true,
  poke: true,
  eat: true,
  float: true,
  build: true,
};

/** Every OtterAction, as a runtime list (for tests and validation). */
export const OTTER_ACTIONS: readonly OtterAction[] = Object.keys(ACTION_SET) as OtterAction[];

/** Registered Phaser animation keys are prefixed to avoid clashes. */
export const ANIM_KEY_PREFIX = 'otter-';

/** OtterState.action -> Phaser animation key. */
export function animationKeyForAction(action: OtterAction): string {
  return `${ANIM_KEY_PREFIX}${action}`;
}

/* ---------------------------- manifest shape ---------------------------- */

export interface AnimationEntry {
  readonly key: string;
  /** Atlas frame names, in playback order. */
  readonly frames: readonly string[];
  readonly frameRate: number;
  /** -1 = loop forever, 0 = play once, n = repeat n times (Phaser semantics). */
  readonly repeat: number;
}

export interface AnimationManifest {
  readonly animations: readonly AnimationEntry[];
}

/**
 * Validate an unknown value against the manifest shape.
 * Returns a list of human-readable problems; empty array = valid.
 */
export function validateManifest(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['manifest is not an object'];
  const animations = (value as { animations?: unknown }).animations;
  if (!Array.isArray(animations)) return ['manifest.animations is not an array'];

  const problems: string[] = [];
  animations.forEach((entry: unknown, i: number) => {
    if (typeof entry !== 'object' || entry === null) {
      problems.push(`animations[${i}] is not an object`);
      return;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.key !== 'string' || e.key.length === 0) {
      problems.push(`animations[${i}].key must be a non-empty string`);
    }
    if (
      !Array.isArray(e.frames) ||
      e.frames.length === 0 ||
      !e.frames.every((frame: unknown) => typeof frame === 'string' && frame.length > 0)
    ) {
      problems.push(`animations[${i}].frames must be a non-empty array of frame names`);
    }
    if (typeof e.frameRate !== 'number' || !(e.frameRate > 0)) {
      problems.push(`animations[${i}].frameRate must be a number > 0`);
    }
    if (typeof e.repeat !== 'number' || !Number.isInteger(e.repeat) || e.repeat < -1) {
      problems.push(`animations[${i}].repeat must be an integer >= -1`);
    }
  });
  return problems;
}

/** Core actions that have no clip in the manifest (must be empty to ship). */
export function missingActions(manifest: AnimationManifest): OtterAction[] {
  const keys = new Set(manifest.animations.map((entry) => entry.key));
  return OTTER_ACTIONS.filter((action) => !keys.has(action));
}

/* --------------------------- Phaser registration ------------------------ */

/**
 * Structural slice of Phaser.Animations.AnimationManager — lets unit tests
 * pass a plain fake, and BootScene pass `this.anims` unchanged.
 */
export interface AnimationRegistrar {
  exists(key: string): boolean;
  create(config: {
    key: string;
    frames: { key: string; frame: string }[];
    frameRate: number;
    repeat: number;
  }): unknown;
}

/**
 * Register every manifest clip under `otter-<key>`. Idempotent: keys that
 * already exist are skipped. Returns the keys actually created.
 */
export function registerAnimations(
  anims: AnimationRegistrar,
  manifest: AnimationManifest,
  textureKey: string,
): string[] {
  const created: string[] = [];
  for (const entry of manifest.animations) {
    const key = `${ANIM_KEY_PREFIX}${entry.key}`;
    if (anims.exists(key)) continue;
    anims.create({
      key,
      frames: entry.frames.map((frame) => ({ key: textureKey, frame })),
      frameRate: entry.frameRate,
      repeat: entry.repeat,
    });
    created.push(key);
  }
  return created;
}
