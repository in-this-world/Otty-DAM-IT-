/**
 * The heart of the core: reduce(state, commands, dtMs) -> { state, events }.
 *
 * PURE: never mutates its input; returns a new GameState with structural
 * sharing of unchanged branches. Runs identically in the browser, in Vitest,
 * and (P3) inside a Colyseus room at 20 Hz.
 *
 * Pipeline per tick:
 *   1. advance tick counter
 *   2. apply queued commands in order (validation -> events, P0 = stubs)
 *   3. run systems (P1 plugs in movement/inventory/dam/timer here)
 *   4. emit tickCompleted
 */
import { damSystem, applyBuild } from './dam';
import { applyDrop, applyPickUp } from './inventory';
import { applyMove, applyStop, isDirection, movementSystem } from './movement';
import { timerSystem } from './timer';
import type { Command, CommandType, GameEvent, GameState } from './types';

/**
 * A system transforms state once per tick and may append events.
 * P1 tasks register movement (P1-01), inventory (P1-02), dam (P1-03) and
 * timer/flood (P1-04) as entries in this pipeline.
 */
export type System = (state: GameState, dtMs: number, events: GameEvent[]) => GameState;

/**
 * Default pipeline (order matters): movement integrates positions, dam
 * resolves the tick's builds (may win instantly), timer counts down and
 * settles the flood last.
 */
export const defaultSystems: readonly System[] = [movementSystem, damSystem, timerSystem];

export interface ReduceResult {
  readonly state: GameState;
  readonly events: GameEvent[];
}

export function reduce(
  state: GameState,
  commands: readonly Command[],
  dtMs: number,
  systems: readonly System[] = defaultSystems,
): ReduceResult {
  const events: GameEvent[] = [];
  let next: GameState = { ...state, tick: state.tick + 1 };

  for (const command of commands) {
    next = applyCommand(next, command, events);
  }
  for (const system of systems) {
    next = system(next, dtMs, events);
  }

  events.push({ type: 'tickCompleted', tick: next.tick });
  return { state: next, events };
}

const KNOWN_COMMAND_TYPES: readonly CommandType[] = [
  'move',
  'stop',
  'pickUp',
  'drop',
  'useItem',
  'poke',
  'build',
];

/** Commands may arrive from the network (P3), so type is untrusted at runtime. */
function commandTypeOf(command: Command): CommandType | 'unknown' {
  return (KNOWN_COMMAND_TYPES as readonly string[]).includes(command.type)
    ? command.type
    : 'unknown';
}

function reject(events: GameEvent[], command: Command, reason: string): void {
  events.push({
    type: 'commandRejected',
    playerId: command.playerId,
    command: commandTypeOf(command),
    reason,
  });
}

/**
 * P0 behaviour: validate, then emit the corresponding event without touching
 * state. P1 tasks replace the stub branches with real state transitions.
 */
function applyCommand(state: GameState, command: Command, events: GameEvent[]): GameState {
  const otter = state.otters[command.playerId];
  if (!otter) {
    reject(events, command, 'unknownPlayer');
    return state;
  }
  if (state.phase !== 'playing') {
    reject(events, command, 'notPlaying');
    return state;
  }

  switch (command.type) {
    case 'move': {
      if (!isDirection(command.dir)) {
        reject(events, command, 'unknownDirection');
        return state;
      }
      events.push({ type: 'otterMoved', playerId: command.playerId, dir: command.dir });
      return applyMove(state, otter, command.dir);
    }
    case 'stop': {
      events.push({ type: 'otterStopped', playerId: command.playerId });
      return applyStop(state, otter);
    }
    case 'poke': {
      events.push({ type: 'otterPoked', attackerId: command.playerId, targetId: null });
      return state; // P1/P2: hit detection, stun, item knock-off
    }
    case 'build': {
      events.push({ type: 'buildAttempted', playerId: command.playerId });
      return applyBuild(state, otter, (reason) => reject(events, command, reason));
    }
    case 'pickUp': {
      return applyPickUp(state, otter, command.itemId, events, (reason) =>
        reject(events, command, reason),
      );
    }
    case 'drop': {
      return applyDrop(state, otter, events, (reason) => reject(events, command, reason));
    }
    case 'useItem': {
      reject(events, command, otter.carrying === null ? 'nothingToUse' : 'notImplemented');
      return state; // P2 item effects (eat fish, cone, ...)
    }
    default: {
      // Exhaustive for TS, but reachable with untrusted runtime input.
      reject(events, command as Command, 'unknownCommandType');
      return state;
    }
  }
}
