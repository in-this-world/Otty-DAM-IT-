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
}

export const EMPTY_SNAPSHOT: InputSnapshot = {
  up: false,
  down: false,
  left: false,
  right: false,
  interact: false,
  build: false,
  poke: false,
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
};

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
}

export const INITIAL_TRACKER: InputTracker = {
  activeDir: null,
  interactWasDown: false,
  buildWasDown: false,
  pokeWasDown: false,
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

  return {
    commands,
    tracker: {
      activeDir: dir,
      interactWasDown: snapshot.interact,
      buildWasDown: snapshot.build,
      pokeWasDown: snapshot.poke,
    },
  };
}
