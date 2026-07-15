/**
 * BUG-06: the server sim must build the SAME arena the client renders
 * (960x540 + one river), else otters spawn outside the camera and are
 * invisible even though snapshots (and the timer) flow correctly.
 */
import { describe, expect, it } from 'vitest';
import { PLAY_WATER, PLAY_WATER_RECT, PLAY_WORLD } from '../../../src/core/state';
import { RoomSimulation } from '../../../src/net/room-sim';

function playingRoom() {
  const room = new RoomSimulation({
    seed: 7,
    roomCode: 'ABCD',
    world: PLAY_WORLD,
    water: PLAY_WATER,
    timerMs: 180_000,
  });
  room.join('sA');
  room.join('sB');
  room.start('sA');
  return room;
}

describe('networked arena matches the client (BUG-06)', () => {
  it('spawns every otter inside the 960x540 play world', () => {
    const room = playingRoom();
    const s = room.state!;
    expect(Object.keys(s.otters).length).toBe(2);
    for (const o of Object.values(s.otters)) {
      expect(o.pos.x).toBeGreaterThanOrEqual(0);
      expect(o.pos.x).toBeLessThanOrEqual(PLAY_WORLD.width);
      expect(o.pos.y).toBeGreaterThanOrEqual(0);
      expect(o.pos.y).toBeLessThanOrEqual(PLAY_WORLD.height);
    }
  });

  it('carries the river through so fish spawn in water', () => {
    const room = playingRoom();
    const s = room.state!;
    expect(s.water.length).toBe(1);
    const r = PLAY_WATER_RECT;
    const fish = Object.values(s.items).filter((i) => i.type === 'fish');
    expect(fish.length).toBeGreaterThan(0);
    for (const f of fish) {
      expect(f.pos.x).toBeGreaterThanOrEqual(r.x);
      expect(f.pos.x).toBeLessThanOrEqual(r.x + r.width);
      expect(f.pos.y).toBeGreaterThanOrEqual(r.y);
      expect(f.pos.y).toBeLessThanOrEqual(r.y + r.height);
    }
  });
});
