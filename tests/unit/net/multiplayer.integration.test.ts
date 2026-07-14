/**
 * P3-04 multiplayer acceptance (in-process, deterministic): a cooperative
 * round reaches a win, a 10-otter room fills and overflow spectates, and a
 * mid-game dropout is AI-covered then removed while the room plays on to a win.
 * Drives every otter with the shared planOtterCommands controller (the same
 * one the server uses for disconnected players), so this exercises the real
 * server loop end to end.
 */
import { describe, expect, it } from 'vitest';
import { planOtterCommands } from '../../../src/core/ai';
import { requiredProgress } from '../../../src/core/dam';
import { RoomSimulation } from '../../../src/net/room-sim';

const TICK_MS = 50;
const MAX_TICKS = 240_000 / TICK_MS; // one full 4-minute round

/** Drive all *connected* otters with AI, stepping until a terminal phase. */
function playOut(room: RoomSimulation, connected: string[]): string {
  for (let t = 0; t < MAX_TICKS; t++) {
    const state = room.state!;
    for (const sid of connected) {
      const otterId = room.roster().find((p) => p.sessionId === sid)?.otterId;
      if (otterId && state.otters[otterId]) {
        for (const cmd of planOtterCommands(state, otterId)) {
          const { playerId: _p, ...bare } = cmd;
          void _p;
          room.enqueue(sid, bare);
        }
      }
    }
    const snap = room.step(TICK_MS)!;
    if (snap.state.phase === 'won' || snap.state.phase === 'lost') return snap.state.phase;
  }
  return room.state!.phase;
}

describe('P3-04 multiplayer', () => {
  it('two otters cooperatively build the dam to a win', () => {
    const room = new RoomSimulation({ seed: 7, roomCode: 'ABCD' });
    room.join('a');
    room.join('b');
    room.start();
    expect(room.state!.dam.required).toBe(requiredProgress(2, 20));
    const outcome = playOut(room, ['a', 'b']);
    expect(outcome).toBe('won');
  });

  it('fills a 10-otter room and sends the 11th to spectate', () => {
    const room = new RoomSimulation({ seed: 3, roomCode: 'ABCD' });
    for (let i = 0; i < 10; i++) expect(room.join(`s${i}`).spectator).toBe(false);
    const overflow = room.join('s10');
    expect(overflow.spectator).toBe(true);
    room.start();
    expect(Object.keys(room.state!.otters)).toHaveLength(10);
    expect(room.state!.dam.required).toBe(requiredProgress(10, 20));
  });

  it('keeps playing to a win after a mid-game dropout (AI-covered then removed)', () => {
    const room = new RoomSimulation({ seed: 7, roomCode: 'ABCD', reconnectWindowMs: 500 });
    room.join('a');
    room.join('b');
    room.start();

    // Play a few ticks, then 'b' drops. AI covers, then the window lapses and
    // the otter is removed with the requirement rescaled to a solo wall.
    for (let i = 0; i < 20; i++) {
      const s = room.state!;
      for (const cmd of planOtterCommands(s, 'otter-1')) {
        const { playerId: _p, ...bare } = cmd;
        void _p;
        room.enqueue('a', bare);
      }
      room.step(TICK_MS);
    }
    room.disconnect('b');
    const outcome = playOut(room, ['a']); // only 'a' remains connected
    expect(outcome).toBe('won');
    expect(Object.keys(room.state!.otters)).toEqual(['otter-1']);
    expect(room.state!.dam.required).toBe(requiredProgress(1, 20));
  });
});
