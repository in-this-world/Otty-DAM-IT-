import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { Command, GameState } from '../../../src/core/types';

const TICK_MS = 50;

function playing(seed = 42): GameState {
  return createInitialState({ playerCount: 2, seed });
}

function firstOtterId(state: GameState): string {
  const id = Object.keys(state.otters)[0];
  if (!id) throw new Error('no otters in state');
  return id;
}

describe('core/tick reduce', () => {
  it('empty tick only advances the tick counter and timer, everything else deep-equal', () => {
    const input = playing();
    const { state, events } = reduce(input, [], TICK_MS);
    expect(state).toEqual({ ...input, tick: input.tick + 1, timerMs: input.timerMs - TICK_MS });
    expect(events).toEqual([{ type: 'tickCompleted', tick: input.tick + 1 }]);
  });

  it('does not mutate the input state', () => {
    const input = playing();
    const snapshot = structuredClone(input);
    reduce(input, [{ type: 'move', playerId: firstOtterId(input), dir: 'left' }], TICK_MS);
    expect(input).toEqual(snapshot);
  });

  it('returns a new state object but shares unchanged branches (structural sharing)', () => {
    const input = playing();
    const { state } = reduce(input, [], TICK_MS);
    expect(state).not.toBe(input);
    expect(state.otters).toBe(input.otters);
    expect(state.dam).toBe(input.dam);
  });

  it('a valid move command produces an otterMoved event', () => {
    const input = playing();
    const id = firstOtterId(input);
    const { events } = reduce(input, [{ type: 'move', playerId: id, dir: 'up' }], TICK_MS);
    expect(events).toContainEqual({ type: 'otterMoved', playerId: id, dir: 'up' });
  });

  it('a valid poke command produces an otterPoked event', () => {
    const input = playing();
    const id = firstOtterId(input);
    const { events } = reduce(input, [{ type: 'poke', playerId: id }], TICK_MS);
    expect(events).toContainEqual({ type: 'otterPoked', attackerId: id, targetId: null });
  });

  it('rejects commands from unknown players', () => {
    const input = playing();
    const { events } = reduce(input, [{ type: 'move', playerId: 'ghost', dir: 'down' }], TICK_MS);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'ghost',
      command: 'move',
      reason: 'unknownPlayer',
    });
  });

  it('rejects commands with an unknown type', () => {
    const input = playing();
    const id = firstOtterId(input);
    const bogus = { type: 'dance', playerId: id } as unknown as Command;
    const { events } = reduce(input, [bogus], TICK_MS);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: id,
      command: 'unknown',
      reason: 'unknownCommandType',
    });
  });

  it('rejects commands when the game is not in the playing phase', () => {
    const lobby = createInitialState({ playerCount: 2, seed: 1, phase: 'lobby' });
    const id = firstOtterId(lobby);
    const { events } = reduce(lobby, [{ type: 'move', playerId: id, dir: 'left' }], TICK_MS);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: id,
      command: 'move',
      reason: 'notPlaying',
    });
  });

  it('rejects pickUp when nothing is in range and drop/useItem when empty-handed', () => {
    const input = playing();
    const id = firstOtterId(input);
    const commands: Command[] = [
      { type: 'pickUp', playerId: id },
      { type: 'drop', playerId: id },
      { type: 'useItem', playerId: id },
    ];
    const { events } = reduce(input, commands, TICK_MS);
    const rejected = events.filter((e) => e.type === 'commandRejected');
    expect(rejected.map((e) => e.command)).toEqual(['pickUp', 'drop', 'useItem']);
  });

  it('processes multiple commands in order and always ends with tickCompleted', () => {
    const input = playing();
    const [a, b] = Object.keys(input.otters);
    if (!a || !b) throw new Error('expected two otters');
    const { events } = reduce(
      input,
      [
        { type: 'move', playerId: a, dir: 'left' },
        { type: 'move', playerId: b, dir: 'right' },
      ],
      TICK_MS,
    );
    expect(events.map((e) => e.type)).toEqual(['otterMoved', 'otterMoved', 'tickCompleted']);
    const last = events[events.length - 1];
    expect(last).toEqual({ type: 'tickCompleted', tick: input.tick + 1 });
  });

  it('runs injected systems in the pipeline (P1 extension point)', () => {
    const input = playing();
    const calls: number[] = [];
    const { state } = reduce(input, [], TICK_MS, [
      (s, dtMs) => {
        calls.push(dtMs);
        return { ...s, timerMs: s.timerMs - dtMs };
      },
    ]);
    expect(calls).toEqual([TICK_MS]);
    expect(state.timerMs).toBe(input.timerMs - TICK_MS);
  });
});
