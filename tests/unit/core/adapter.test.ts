import { describe, expect, it } from 'vitest';
import { LocalAdapter, ManualScheduler } from '../../../src/core/adapter';
import type { GameEvent, GameState } from '../../../src/core/types';

const CONFIG = { playerCount: 2, seed: 42 };

function makeAdapter() {
  const scheduler = new ManualScheduler();
  const adapter = new LocalAdapter(CONFIG, { scheduler });
  return { adapter, scheduler };
}

function firstOtterId(state: GameState): string {
  const id = Object.keys(state.otters)[0];
  if (!id) throw new Error('no otters in state');
  return id;
}

describe('core/adapter LocalAdapter (fake clock, no real timers)', () => {
  it('delivers state snapshots to subscribers on each tick', () => {
    const { adapter, scheduler } = makeAdapter();
    const seen: GameState[] = [];
    adapter.onState((s) => seen.push(s));
    adapter.start();
    scheduler.advance(50);
    scheduler.advance(50);
    expect(seen.map((s) => s.tick)).toEqual([1, 2]);
    expect(adapter.getState().tick).toBe(2);
  });

  it('delivers events produced by enqueued commands', () => {
    const { adapter, scheduler } = makeAdapter();
    const batches: (readonly GameEvent[])[] = [];
    adapter.onEvents((e) => batches.push(e));
    adapter.start();
    const id = firstOtterId(adapter.getState());
    adapter.sendCommand({ type: 'move', playerId: id, dir: 'up' });
    scheduler.advance(50);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toContainEqual({ type: 'otterMoved', playerId: id, dir: 'up' });
    expect(batches[0]).toContainEqual({ type: 'tickCompleted', tick: 1 });
  });

  it('drains the command queue: a command is only applied once', () => {
    const { adapter, scheduler } = makeAdapter();
    const all: GameEvent[] = [];
    adapter.onEvents((e) => all.push(...e));
    adapter.start();
    const id = firstOtterId(adapter.getState());
    // A one-shot command (move) must fire its event exactly once, even though
    // the tick loop advances twice — i.e. the queue isn't re-applied.
    adapter.sendCommand({ type: 'move', playerId: id, dir: 'up' });
    scheduler.advance(50);
    scheduler.advance(50);
    expect(all.filter((e) => e.type === 'otterMoved')).toHaveLength(1);
  });

  it('stop() halts the loop; start() is idempotent', () => {
    const { adapter, scheduler } = makeAdapter();
    let stateCalls = 0;
    adapter.onState(() => stateCalls++);
    adapter.start();
    adapter.start();
    scheduler.advance(50);
    adapter.stop();
    scheduler.advance(50);
    expect(stateCalls).toBe(1);
    expect(adapter.getState().tick).toBe(1);
  });

  it('unsubscribe stops delivery to that callback only', () => {
    const { adapter, scheduler } = makeAdapter();
    let a = 0;
    let b = 0;
    const offA = adapter.onState(() => a++);
    adapter.onState(() => b++);
    adapter.start();
    scheduler.advance(50);
    offA();
    scheduler.advance(50);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('two adapters with the same seed and commands stay in lockstep (determinism)', () => {
    const s1 = new ManualScheduler();
    const s2 = new ManualScheduler();
    const a1 = new LocalAdapter(CONFIG, { scheduler: s1 });
    const a2 = new LocalAdapter(CONFIG, { scheduler: s2 });
    a1.start();
    a2.start();
    const id = firstOtterId(a1.getState());
    for (const adapter of [a1, a2]) {
      adapter.sendCommand({ type: 'move', playerId: id, dir: 'left' });
      adapter.sendCommand({ type: 'build', playerId: id });
    }
    for (let i = 0; i < 3; i++) {
      s1.advance(50);
      s2.advance(50);
    }
    expect(a1.getState()).toEqual(a2.getState());
  });
});
