/**
 * P1-05 input mapping — PURE module (zero Phaser imports).
 *
 * GameScene maintains a Set of currently-held KeyboardEvent.code values and
 * calls this module once per frame:
 *
 *   snapshot = snapshotFromCodes(codesDown)
 *   { commands, tracker } = deriveCommands(tracker, snapshot, playerId, carrying)
 *
 * Bindings (documented in Docs/P1-05_summary.md):
 *   Arrows / WASD  -> move / stop (edge-triggered: a command is only emitted
 *                     when the resolved direction changes)
 *   E or Space     -> contextual interact: pickUp when empty-handed, drop
 *                     when carrying (edge-triggered on key press)
 *   B              -> build (edge-triggered on key press)
 *   T / G / Q      -> throwItem / dig / useItem(eat) (edge-triggered; P2-10)
 *   R              -> handled by GameScene directly (restart after win/lose);
 *                     it never becomes a core Command.
 */
import type { Command, Direction } from '../core/types';

export interface InputSnapshot {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
  /** E / Space — contextual pickUp or drop. */
  readonly interact: boolean;
  /** B — build at the dam. */
  readonly build: boolean;
  /** F — poke a nearby otter (P2-02). */
  readonly poke: boolean;
  /** C — hold to swim while in water (P2-03). */
  readonly swim: boolean;
  /** T — throw the held item (P2-10). */
  readonly throw: boolean;
  /** G — dig for dirt / leave a pit (P2-10). */
  readonly dig: boolean;
  /** Q — eat the held fish (P2-10). */
  readonly eat: boolean;
}

export const EMPTY_SNAPSHOT: InputSnapshot = {
  up: false,
  down: false,
  left: false,
  right: false,
  interact: false,
  build: false,
  poke: false,
  swim: false,
  throw: false,
  dig: false,
  eat: false,
};

/** KeyboardEvent.code -> logical input. Unknown codes are ignored. */
const CODE_MAP: Readonly<Record<string, keyof InputSnapshot>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyE: 'interact',
  Space: 'interact',
  KeyB: 'build',
  KeyF: 'poke',
  KeyC: 'swim',
  KeyT: 'throw',
  KeyG: 'dig',
  KeyQ: 'eat',
};

/**
 * OR two input snapshots field-by-field. Lets the mobile touch controls and
 * the keyboard feed the same `deriveCommands` pipeline (P2-06): a logical
 * input is "held" if either source has it down.
 */
export function mergeSnapshots(
  a: InputSnapshot,
  b: Partial<InputSnapshot>,
): InputSnapshot {
  return {
    up: a.up || b.up === true,
    down: a.down || b.down === true,
    left: a.left || b.left === true,
    right: a.right || b.right === true,
    interact: a.interact || b.interact === true,
    build: a.build || b.build === true,
    poke: a.poke || b.poke === true,
    swim: a.swim || b.swim === true,
    throw: a.throw || b.throw === true,
    dig: a.dig || b.dig === true,
    eat: a.eat || b.eat === true,
  };
}

export function snapshotFromCodes(codes: ReadonlySet<string>): InputSnapshot {
  const snapshot = { ...EMPTY_SNAPSHOT } as Record<keyof InputSnapshot, boolean>;
  for (const code of codes) {
    const logical = CODE_MAP[code];
    if (logical) snapshot[logical] = true;
  }
  return snapshot;
}

/**
 * Cross-frame memory needed to edge-trigger commands. Persisted by the
 * caller between frames; this module never mutates it.
 */
export interface InputTracker {
  /** Direction currently commanded to the core, or null when stopped. */
  readonly activeDir: Direction | null;
  readonly interactWasDown: boolean;
  readonly buildWasDown: boolean;
  readonly pokeWasDown: boolean;
  readonly swimWasDown: boolean;
  readonly throwWasDown: boolean;
  readonly digWasDown: boolean;
  readonly eatWasDown: boolean;
}

export const INITIAL_TRACKER: InputTracker = {
  activeDir: null,
  interactWasDown: false,
  buildWasDown: false,
  pokeWasDown: false,
  swimWasDown: false,
  throwWasDown: false,
  digWasDown: false,
  eatWasDown: false,
};

/** Tie-break order when several direction keys are held at once. */
const DIR_PRIORITY: readonly Direction[] = ['up', 'down', 'left', 'right'];

/**
 * Resolve the direction to command. A currently-active direction wins while
 * its key is still held (so adding a second key does not zig-zag); otherwise
 * the first held direction in DIR_PRIORITY order is chosen.
 */
export function resolveDirection(
  snapshot: InputSnapshot,
  current: Direction | null,
): Direction | null {
  if (current !== null && snapshot[current]) return current;
  for (const dir of DIR_PRIORITY) {
    if (snapshot[dir]) return dir;
  }
  return null;
}

export interface DeriveResult {
  readonly commands: readonly Command[];
  readonly tracker: InputTracker;
}

/**
 * Turn a per-frame snapshot into core Commands.
 *
 * - move/stop only when the resolved direction changed since last frame
 * - interact edge: pickUp when `carrying` is false, drop when true
 * - build edge: one build command per key press
 */
export function deriveCommands(
  tracker: InputTracker,
  snapshot: InputSnapshot,
  playerId: string,
  carrying: boolean,
): DeriveResult {
  const commands: Command[] = [];

  const dir = resolveDirection(snapshot, tracker.activeDir);
  if (dir !== tracker.activeDir) {
    commands.push(dir === null ? { type: 'stop', playerId } : { type: 'move', playerId, dir });
  }

  if (snapshot.interact && !tracker.interactWasDown) {
    commands.push(carrying ? { type: 'drop', playerId } : { type: 'pickUp', playerId });
  }

  if (snapshot.build && !tracker.buildWasDown) {
    commands.push({ type: 'build', playerId });
  }

  if (snapshot.poke && !tracker.pokeWasDown) {
    commands.push({ type: 'poke', playerId });
  }

  // toggle-swim: one command per key press (core flips wantsSwim)
  if (snapshot.swim && !tracker.swimWasDown) {
    commands.push({ type: 'swim', playerId });
  }

  // P2-10: throw / dig / eat existed in core all along — now key-bound.
  if (snapshot.throw && !tracker.throwWasDown) {
    commands.push({ type: 'throwItem', playerId });
  }
  if (snapshot.dig && !tracker.digWasDown) {
    commands.push({ type: 'dig', playerId });
  }
  if (snapshot.eat && !tracker.eatWasDown) {
    commands.push({ type: 'useItem', playerId });
  }

  return {
    commands,
    tracker: {
      activeDir: dir,
      interactWasDown: snapshot.interact,
      buildWasDown: snapshot.build,
      pokeWasDown: snapshot.poke,
      swimWasDown: snapshot.swim,
      throwWasDown: snapshot.throw,
      digWasDown: snapshot.dig,
      eatWasDown: snapshot.eat,
    },
  };
}
