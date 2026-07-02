/**
 * P1-01: movement + world-bounds clamping.
 * move sets facing/velocity; the movement system integrates pos by
 * speedPerSec * dt each tick; positions are clamped to the world rect.
 */
import { describe, expect, it } from 'vitest';
import { movementSystem } from '../../../src/core/movement';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { Command, Direction, GameState, OtterState } from '../../../src/core/types';

const TICK_MS = 50;
const WORLD = { width: 1000, height: 800 };
const ID = 'otter-1';

function stateWithOtterAt(x: number, y: number): GameState {
  const s = createInitialState({ playerCount: 1, seed: 1, world: WORLD });
  const o = s.otters[ID];
  if (!o) throw new Error('missing otter');
  return { ...s, otters: { [ID]: { ...o, pos: { x, y } } } };
}

function otter(s: GameState): OtterState {
  const o = s.otters[ID];
  if (!o) throw new Error('missing otter');
  return o;
}

const move = (dir: Direction): Command => ({ type: 'move', playerId: ID, dir });

describe('core/movement (P1-01)', () => {
  it('move command sets facing, walk action and velocity for each direction', () => {
    let s = stateWithOtterAt(500, 400);
    const expectVel: Record<Direction, { x: number; y: number }> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    for (const dir of ['left', 'down', 'right', 'up'] as const) {
      ({ state: s } = reduce(s, [move(dir)], TICK_MS));
      const o = otter(s);
      expect(o.facing).toBe(dir);
      expect(o.action).toBe('walk');
      expect(o.vel).toEqual({
        x: expectVel[dir].x * o.speedPerSec,
        y: expectVel[dir].y * o.speedPerSec,
      });
    }
  });

  it('integrates position by speedPerSec * dt over ticks', () => {
    let s = stateWithOtterAt(500, 400);
    ({ state: s } = reduce(s, [move('right')], TICK_MS));
    // command applies before systems, so movement already happens this tick
    expect(otter(s).pos.x).toBeCloseTo(510); // 200/s * 0.05s
    for (let i = 0; i < 3; i++) ({ state: s } = reduce(s, [], TICK_MS));
    expect(otter(s).pos.x).toBeCloseTo(540);
    expect(otter(s).pos.y).toBeCloseTo(400);
  });

  it('stop halts the otter and returns it to idle', () => {
    let s = stateWithOtterAt(500, 400);
    ({ state: s } = reduce(s, [move('down')], TICK_MS));
    ({ state: s } = reduce(s, [{ type: 'stop', playerId: ID }], TICK_MS));
    const o = otter(s);
    expect(o.vel).toEqual({ x: 0, y: 0 });
    expect(o.action).toBe('idle');
    const posAfterStop = o.pos;
    ({ state: s } = reduce(s, [], TICK_MS));
    expect(otter(s).pos).toEqual(posAfterStop);
  });

  it('clamps positions to world bounds (right and top edges)', () => {
    let s = stateWithOtterAt(995, 400);
    ({ state: s } = reduce(s, [move('right')], TICK_MS));
    for (let i = 0; i < 5; i++) ({ state: s } = reduce(s, [], TICK_MS));
    expect(otter(s).pos.x).toBe(WORLD.width);
    expect(otter(s).pos.y).toBe(400);

    let t = stateWithOtterAt(500, 4);
    ({ state: t } = reduce(t, [move('up')], TICK_MS));
    ({ state: t } = reduce(t, [], TICK_MS));
    expect(otter(t).pos.y).toBe(0);
  });

  it('clamps at the left/bottom edges too', () => {
    let s = stateWithOtterAt(3, 797);
    ({ state: s } = reduce(s, [move('left')], TICK_MS));
    expect(otter(s).pos.x).toBe(0);
    ({ state: s } = reduce(s, [move('down')], TICK_MS));
    ({ state: s } = reduce(s, [], TICK_MS));
    expect(otter(s).pos.y).toBe(WORLD.height);
  });

  it('rejects a move command with an unknown direction', () => {
    const s = stateWithOtterAt(500, 400);
    const bogus = { type: 'move', playerId: ID, dir: 'diagonal' } as unknown as Command;
    const { events } = reduce(s, [bogus], TICK_MS);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: ID,
      command: 'move',
      reason: 'unknownDirection',
    });
  });

  it('movementSystem is an identity (same reference) when nobody moves', () => {
    const s = stateWithOtterAt(500, 400);
    expect(movementSystem(s, TICK_MS, [])).toBe(s);
  });

  it('does not move otters when the phase is not playing', () => {
    let s = stateWithOtterAt(500, 400);
    ({ state: s } = reduce(s, [move('right')], TICK_MS));
    const frozen: GameState = { ...s, phase: 'lost' };
    const after = movementSystem(frozen, TICK_MS, []);
    expect(otter(after).pos).toEqual(otter(frozen).pos);
  });
});
