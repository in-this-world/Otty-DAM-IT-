/**
 * P3-02 acceptance: the local and networked adapters honour the same
 * GameAdapter contract ("local 與 colyseus adapter 過同一套測試"), and the
 * server's authoritative stream matches LocalAdapter tick-for-tick (proof the
 * same pure core runs on the server).
 */
import { describe, expect, it } from 'vitest';
import {
  LocalAdapter,
  ManualScheduler,
  type GameAdapter,
} from '../../../src/core/adapter';
import type { Command, GameState } from '../../../src/core/types';
import { ColyseusAdapter } from '../../../src/net/ColyseusAdapter';
import { RoomSimulation } from '../../../src/net/room-sim';
import { LoopbackTransport } from '../../../src/net/transport';

const TICK_MS = 50;
const SEED = 7;

interface Harness {
  readonly adapter: GameAdapter;
  readonly localId: string;
  /** Advance one full step (server + client view). */
  step(): void;
}

function localHarness(): Harness {
  const scheduler = new ManualScheduler();
  const adapter = new LocalAdapter({ playerCount: 1, seed: SEED }, { scheduler });
  adapter.start();
  return { adapter, localId: 'otter-1', step: () => scheduler.advance(TICK_MS) };
}

function colyseusHarness(): Harness {
  const server = new ManualScheduler();
  const render = new ManualScheduler();
  const sim = new RoomSimulation({ seed: SEED, roomCode: 'ABCD' });
  const transport = new LoopbackTransport(sim, {
    serverScheduler: server,
    sessionId: 'local',
    autoStart: true,
  });
  const adapter = new ColyseusAdapter(transport, {
    renderScheduler: render,
    interpolationDelayMs: 0,
    predict: true,
  });
  adapter.start(); // open() -> join + autostart + welcome
  return {
    adapter,
    localId: 'otter-1',
    step: () => {
      server.advance(TICK_MS); // authoritative tick -> snapshot
      render.advance(TICK_MS); // client view -> onState
    },
  };
}

function runContract(name: string, make: () => Harness): void {
  describe(`GameAdapter contract — ${name}`, () => {
    it('publishes state and reflects a move command', () => {
      const h = make();
      let latest: GameState | undefined;
      h.adapter.onState((s) => (latest = s));
      h.step(); // prime a snapshot/state
      const x0 = (latest ?? h.adapter.getState()).otters[h.localId]!.pos.x;

      h.adapter.sendCommand({ type: 'move', dir: 'right', playerId: h.localId } as Command);
      for (let i = 0; i < 4; i++) h.step();
      const x1 = h.adapter.getState().otters[h.localId]!.pos.x;
      expect(x1).toBeGreaterThan(x0);
    });

    it('halts after a stop command', () => {
      const h = make();
      h.adapter.sendCommand({ type: 'move', dir: 'right', playerId: h.localId } as Command);
      for (let i = 0; i < 3; i++) h.step();
      h.adapter.sendCommand({ type: 'stop', playerId: h.localId } as Command);
      for (let i = 0; i < 2; i++) h.step();
      const a = h.adapter.getState().otters[h.localId]!.pos.x;
      for (let i = 0; i < 3; i++) h.step();
      const b = h.adapter.getState().otters[h.localId]!.pos.x;
      expect(b).toBeCloseTo(a, 3);
    });

    it('getState returns a live snapshot after stepping', () => {
      const h = make();
      h.step();
      expect(h.adapter.getState().otters[h.localId]).toBeTruthy();
      expect(h.adapter.getState().phase).toBe('playing');
    });
  });
}

runContract('LocalAdapter', localHarness);
runContract('ColyseusAdapter (loopback)', colyseusHarness);

describe('server/local parity (P3-02)', () => {
  it('RoomSimulation matches LocalAdapter tick-for-tick under identical input', () => {
    const scheduler = new ManualScheduler();
    const local = new LocalAdapter({ playerCount: 2, seed: SEED }, { scheduler });
    let localState: GameState | undefined;
    local.onState((s) => (localState = s));
    local.start();

    const sim = new RoomSimulation({ seed: SEED, roomCode: 'ABCD' });
    sim.join('a');
    sim.join('b');
    sim.start();

    const script: (Command | null)[] = [
      { type: 'move', dir: 'right', playerId: 'otter-1' },
      { type: 'move', dir: 'down', playerId: 'otter-1' },
      null,
      { type: 'stop', playerId: 'otter-1' },
      { type: 'move', dir: 'left', playerId: 'otter-1' },
    ];

    for (let i = 0; i < script.length; i++) {
      const cmd = script[i];
      if (cmd) {
        local.sendCommand(cmd);
        const { playerId: _pid, ...bare } = cmd;
        void _pid;
        sim.enqueue('a', bare);
      }
      scheduler.advance(TICK_MS);
      const snap = sim.step(TICK_MS)!;
      expect(snap.state.tick).toBe(localState!.tick);
      expect(snap.state.otters).toEqual(localState!.otters);
      expect(snap.state.dam).toEqual(localState!.dam);
    }
  });
});
