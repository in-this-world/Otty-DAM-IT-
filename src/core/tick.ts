/**
 * The heart of the core: reduce(state, commands, dtMs) -> { state, events }.
 *
 * PURE: never mutates its input; returns a new GameState with structural
 * sharing of unchanged branches. Runs identically in the browser, in Vitest,
 * and (P3) inside a Colyseus room at 20 Hz.
 *
 * Pipeline per tick:
 *   1. advance tick counter
 *   2. apply queued commands in order (validation -> events)
 *   3. run systems (movement -> float -> effects -> dam -> timer)
 *   4. emit tickCompleted
 */
import { damSystem, applyBuild } from './dam';
import { effectsSystem } from './effects';
import { fishSwimSystem } from './fish';
import { floatSystem } from './float';
import { hazardSystem } from './hazards';
import { applyDrop, applyPickUp } from './inventory';
import { applyDig, applyThrow, applyUseItem } from './items';
import { applyMove, applyStop, isDirection, movementSystem } from './movement';
import { applyPoke } from './poke';
import { applySwim, applyStopSwim } from './float';
import { transientActionSystem } from './action';
import { timerSystem } from './timer';
import type { Command, CommandType, GameEvent, GameState } from './types';

/**
 * A system transforms state once per tick and may append events.
 * P1 tasks registered movement (P1-01), dam (P1-03) and timer/flood
 * (P1-04); P2-01 added effects (buff/stun decay, pits).
 */
export type System = (state: GameState, dtMs: number, events: GameEvent[]) => GameState;

/**
 * Default pipeline (order matters): movement integrates positions, effects
 * decays buffs/stuns and resolves pit collisions (after movement, so
 * walking into a pit triggers the same tick), dam resolves the tick's
 * builds (may win instantly), timer counts down and settles the flood last.
 */
export const defaultSystems: readonly System[] = [
  movementSystem,
  floatSystem,
  fishSwimSystem,
  effectsSystem,
  hazardSystem,
  damSystem,
  transientActionSystem,
  timerSystem,
];

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
  'throwItem',
  'dig',
  'poke',
  'build',
  'swim',
  'stopSwim',
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
  if (otter.stunnedMs > 0) {
    // Dizzy otters can't act at all (P2-01); the stun decays in effectsSystem.
    reject(events, command, 'stunned');
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
      return applyPoke(state, otter, events, (reason) => reject(events, command, reason));
    }
    case 'swim': {
      return applySwim(state, otter);
    }
    case 'stopSwim': {
      return applyStopSwim(state, otter);
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
      return applyUseItem(state, otter, events, (reason) => reject(events, command, reason));
    }
    case 'throwItem': {
      return applyThrow(state, otter, events, (reason) => reject(events, command, reason));
    }
    case 'dig': {
      return applyDig(state, otter, events, (reason) => reject(events, command, reason));
    }
    default: {
      // Exhaustive for TS, but reachable with untrusted runtime input.
      reject(events, command as Command, 'unknownCommandType');
      return state;
    }
  }
}
