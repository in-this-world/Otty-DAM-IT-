/**
 * P1-05: keyboard -> Command mapping (pure module).
 */
import { describe, expect, it } from 'vitest';
import {
  deriveCommands,
  EMPTY_SNAPSHOT,
  INITIAL_TRACKER,
  mergeSnapshots,
  resolveDirection,
  snapshotFromCodes,
} from '../../../src/game/input';

const P = 'otter-1';
const snap = (over: Partial<typeof EMPTY_SNAPSHOT>) => ({ ...EMPTY_SNAPSHOT, ...over });

describe('game/input (P1-05)', () => {
  it('maps arrows, WASD, E/Space and B; ignores unknown codes', () => {
    expect(snapshotFromCodes(new Set(['ArrowUp', 'KeyD', 'Space', 'KeyB', 'KeyZ']))).toEqual(
      snap({ up: true, right: true, interact: true, build: true }),
    );
    expect(snapshotFromCodes(new Set(['KeyW', 'KeyA', 'KeyS', 'KeyE']))).toEqual(
      snap({ up: true, left: true, down: true, interact: true }),
    );
  });

  it('resolveDirection keeps the active direction while held, else picks by priority', () => {
    expect(resolveDirection(snap({ left: true, right: true }), 'right')).toBe('right');
    expect(resolveDirection(snap({ left: true, right: true }), null)).toBe('left');
    expect(resolveDirection(EMPTY_SNAPSHOT, 'up')).toBeNull();
  });

  it('emits move only on direction change and stop on release', () => {
    let r = deriveCommands(INITIAL_TRACKER, snap({ right: true }), P, false);
    expect(r.commands).toEqual([{ type: 'move', playerId: P, dir: 'right' }]);
    // held: no repeat command
    r = deriveCommands(r.tracker, snap({ right: true }), P, false);
    expect(r.commands).toEqual([]);
    // released: stop
    r = deriveCommands(r.tracker, EMPTY_SNAPSHOT, P, false);
    expect(r.commands).toEqual([{ type: 'stop', playerId: P }]);
    // still nothing held: silence
    r = deriveCommands(r.tracker, EMPTY_SNAPSHOT, P, false);
    expect(r.commands).toEqual([]);
  });

  it('interact is contextual (pickUp empty-handed, drop when carrying) and edge-triggered', () => {
    let r = deriveCommands(INITIAL_TRACKER, snap({ interact: true }), P, false);
    expect(r.commands).toEqual([{ type: 'pickUp', playerId: P }]);
    r = deriveCommands(r.tracker, snap({ interact: true }), P, false);
    expect(r.commands).toEqual([]); // held, no repeat
    r = deriveCommands(r.tracker, EMPTY_SNAPSHOT, P, true);
    r = deriveCommands(r.tracker, snap({ interact: true }), P, true);
    expect(r.commands).toEqual([{ type: 'drop', playerId: P }]);
  });

  it('build is edge-triggered and can combine with movement in one frame', () => {
    let r = deriveCommands(INITIAL_TRACKER, snap({ up: true, build: true }), P, false);
    expect(r.commands).toEqual([
      { type: 'move', playerId: P, dir: 'up' },
      { type: 'build', playerId: P },
    ]);
    r = deriveCommands(r.tracker, snap({ up: true, build: true }), P, false);
    expect(r.commands).toEqual([]);
  });
});

describe('game/input poke (P2-02)', () => {
  const P = 'otter-1';
  it('maps KeyF to poke and edge-triggers one command per press', () => {
    expect(snapshotFromCodes(new Set(['KeyF'])).poke).toBe(true);
    let r = deriveCommands(INITIAL_TRACKER, { ...EMPTY_SNAPSHOT, poke: true }, P, false);
    expect(r.commands).toEqual([{ type: 'poke', playerId: P }]);
    r = deriveCommands(r.tracker, { ...EMPTY_SNAPSHOT, poke: true }, P, false);
    expect(r.commands).toEqual([]); // held, no repeat
    r = deriveCommands(r.tracker, EMPTY_SNAPSHOT, P, false);
    expect(r.commands).toEqual([]);
  });
});

describe('game/input swim (P2-03 hold-to-swim)', () => {
  const P = 'otter-1';
  it('maps KeyC to swim and fires one toggle command per press', () => {
    expect(snapshotFromCodes(new Set(['KeyC'])).swim).toBe(true);
    let r = deriveCommands(INITIAL_TRACKER, { ...EMPTY_SNAPSHOT, swim: true }, P, false);
    expect(r.commands).toEqual([{ type: 'swim', playerId: P }]); // press -> toggle
    r = deriveCommands(r.tracker, { ...EMPTY_SNAPSHOT, swim: true }, P, false); // held
    expect(r.commands).toEqual([]);
    r = deriveCommands(r.tracker, EMPTY_SNAPSHOT, P, false); // released: nothing
    expect(r.commands).toEqual([]);
    r = deriveCommands(r.tracker, { ...EMPTY_SNAPSHOT, swim: true }, P, false); // press again -> toggle
    expect(r.commands).toEqual([{ type: 'swim', playerId: P }]);
  });
});

describe('P2-10: throw / dig / eat bindings', () => {
  it('maps KeyT/KeyG/KeyQ to logical inputs', () => {
    const snap = snapshotFromCodes(new Set(['KeyT', 'KeyG', 'KeyQ']));
    expect(snap.throw).toBe(true);
    expect(snap.dig).toBe(true);
    expect(snap.eat).toBe(true);
  });

  it('edge-triggers throwItem / dig / useItem once per press', () => {
    const down = { ...EMPTY_SNAPSHOT, throw: true, dig: true, eat: true };
    const first = deriveCommands(INITIAL_TRACKER, down, 'p1', true);
    expect(first.commands).toEqual(
      expect.arrayContaining([
        { type: 'throwItem', playerId: 'p1' },
        { type: 'dig', playerId: 'p1' },
        { type: 'useItem', playerId: 'p1' },
      ]),
    );
    // held: no repeats next frame
    const second = deriveCommands(first.tracker, down, 'p1', true);
    expect(second.commands.filter((c) => c.type !== 'move' && c.type !== 'stop')).toHaveLength(0);
  });

  it('mergeSnapshots ORs the new fields (mobile buttons)', () => {
    const merged = mergeSnapshots(EMPTY_SNAPSHOT, { throw: true, eat: true });
    expect(merged.throw).toBe(true);
    expect(merged.dig).toBe(false);
    expect(merged.eat).toBe(true);
  });
});
