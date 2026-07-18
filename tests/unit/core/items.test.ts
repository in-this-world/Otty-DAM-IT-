/**
 * P2-01: full item set in the pure core.
 *
 * fish  — useItem eats it (speed boost); throwItem hurls it and stuns on hit.
 * stone — heavy (carry speed x0.5) but worth 3 dam progress.
 * cone  — useItem wears it as a hat (eagle immunity hook for P2-04);
 *         getting stunned knocks it off.
 * dirt  — dig command spawns a dirt block (buildable) and leaves a pit
 *         that stuns whoever walks in (digger immune for a grace period).
 */
import { describe, expect, it } from 'vitest';
import {
  FISH_BOOST_MS,
  FISH_SPEED_MULT,
  MAX_MUSHROOM_STACKS,
  MUSHROOM_SCALE,
  PIT_DIGGER_IMMUNE_MS,
  PIT_RADIUS,
  PIT_STUN_MS,
  STONE_CARRY_SPEED_MULT,
  THROW_DISTANCE,
  THROWN_FISH_STUN_MS,
} from '../../../src/core/items';
import { BUILD_AMOUNTS } from '../../../src/core/dam';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { Command, GameState, ItemType, OtterState, Vec2 } from '../../../src/core/types';

const TICK_MS = 50;
const WORLD = { width: 1000, height: 800 };
/** A seed whose first rngStep() value (~0.0117) lands in the 'poop' loot bucket [0, 0.20). */
const POOP_ROLL_SEED = 7;

function setup(items: readonly { id: string; type: ItemType; pos: Vec2 }[]): GameState {
  return createInitialState({ playerCount: 3, seed: 1, world: WORLD, items });
}

function placeOtter(s: GameState, id: string, x: number, y: number, facing?: OtterState['facing']): GameState {
  const o = s.otters[id];
  if (!o) throw new Error(`missing otter ${id}`);
  return {
    ...s,
    otters: { ...s.otters, [id]: { ...o, pos: { x, y }, facing: facing ?? o.facing } },
  };
}

function otter(s: GameState, id: string): OtterState {
  const o = s.otters[id];
  if (!o) throw new Error(`missing otter ${id}`);
  return o;
}

function run(s: GameState, commands: readonly Command[]) {
  return reduce(s, commands, TICK_MS);
}

/** Start a build then run idle ticks until the channel lands (build is a channel). */
function buildChannel(s: GameState): { state: GameState; events: import('../../../src/core/types').GameEvent[] } {
  const events: import('../../../src/core/types').GameEvent[] = [];
  let r = run(s, [{ type: 'build', playerId: 'otter-1' }]);
  s = r.state;
  events.push(...r.events);
  for (let i = 0; i < 40 && s.dam.progress === 0 && s.phase === 'playing'; i++) {
    r = run(s, []);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/* ------------------------------------------------------------------ */

describe('fish: eat (useItem)', () => {
  function carryingFish(): GameState {
    let s = setup([{ id: 'f1', type: 'fish', pos: { x: 100, y: 100 } }]);
    s = placeOtter(s, 'otter-1', 100, 100);
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    return s;
  }

  it('consumes the fish, plays eat, grants a speed boost, emits itemEaten', () => {
    const { state, events } = run(carryingFish(), [{ type: 'useItem', playerId: 'otter-1' }]);
    const o = otter(state, 'otter-1');
    expect(o.carrying).toBeNull();
    expect(o.action).toBe('eat');
    // boost is granted in the command phase, then decays by dt this tick
    expect(o.speedBoostMs).toBe(FISH_BOOST_MS - TICK_MS);
    expect(state.items['f1']).toBeUndefined();
    expect(events).toContainEqual({
      type: 'itemEaten',
      playerId: 'otter-1',
      itemId: 'f1',
      itemType: 'fish',
    });
  });

  it('boosted otters move FISH_SPEED_MULT times faster', () => {
    let s = carryingFish();
    ({ state: s } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]));
    const before = otter(s, 'otter-1').pos.x;
    ({ state: s } = run(s, [{ type: 'move', playerId: 'otter-1', dir: 'right' }]));
    const speed = otter(s, 'otter-1').speedPerSec;
    expect(otter(s, 'otter-1').pos.x - before).toBeCloseTo(speed * FISH_SPEED_MULT * (TICK_MS / 1000));
  });

  it('the boost expires: normal speed once speedBoostMs reaches 0', () => {
    let s = setup([]);
    s = placeOtter(s, 'otter-1', 100, 100);
    const o = otter(s, 'otter-1');
    // boost with less than one tick remaining, already walking right
    s = {
      ...s,
      otters: {
        ...s.otters,
        'otter-1': { ...o, speedBoostMs: 40, vel: { x: o.speedPerSec, y: 0 } },
      },
    };
    let r = run(s, []);
    // tick 1: boost still active during integration
    expect(otter(r.state, 'otter-1').pos.x - 100).toBeCloseTo(200 * FISH_SPEED_MULT * 0.05);
    expect(otter(r.state, 'otter-1').speedBoostMs).toBe(0);
    const x1 = otter(r.state, 'otter-1').pos.x;
    r = run(r.state, []);
    // tick 2: back to base speed
    expect(otter(r.state, 'otter-1').pos.x - x1).toBeCloseTo(200 * 0.05);
  });

  it('useItem with a non-food building material is rejected', () => {
    let s = setup([{ id: 'b1', type: 'branch', pos: { x: 100, y: 100 } }]);
    s = placeOtter(s, 'otter-1', 100, 100);
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    const { events } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-1',
      command: 'useItem',
      reason: 'noUseForItem',
    });
  });
});

describe('fish: throwItem', () => {
  function carrying(type: ItemType): GameState {
    let s = setup([{ id: 'x1', type, pos: { x: 100, y: 100 } }]);
    s = placeOtter(s, 'otter-1', 100, 100, 'right');
    s = placeOtter(s, 'otter-2', 600, 600); // far away by default
    s = placeOtter(s, 'otter-3', 700, 700);
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    return placeOtter(s, 'otter-1', 100, 100, 'right'); // restore facing
  }

  it('throws the carried item THROW_DISTANCE in the facing direction', () => {
    const { state, events } = run(carrying('fish'), [{ type: 'throwItem', playerId: 'otter-1' }]);
    expect(otter(state, 'otter-1').carrying).toBeNull();
    expect(state.items['x1']).toMatchObject({
      heldBy: null,
      pos: { x: 100 + THROW_DISTANCE, y: 100 },
    });
    expect(events).toContainEqual({
      type: 'itemThrown',
      playerId: 'otter-1',
      itemId: 'x1',
      itemType: 'fish',
      from: { x: 100, y: 100 },
      to: { x: 100 + THROW_DISTANCE, y: 100 },
    });
  });

  it('landing position is clamped to the world bounds', () => {
    let s = carrying('fish');
    s = placeOtter(s, 'otter-1', WORLD.width - 10, 100, 'right');
    const { state } = run(s, [{ type: 'throwItem', playerId: 'otter-1' }]);
    expect(state.items['x1']?.pos.x).toBe(WORLD.width);
  });

  it('a thrown fish that hits another otter stuns them and drops at their feet', () => {
    let s = carrying('fish');
    s = placeOtter(s, 'otter-2', 200, 110); // on the throw path, within hit radius
    const { state, events } = run(s, [{ type: 'throwItem', playerId: 'otter-1' }]);
    const target = otter(state, 'otter-2');
    // stun applied in the command phase, decays by dt this tick
    expect(target.stunnedMs).toBe(THROWN_FISH_STUN_MS - TICK_MS);
    expect(target.vel).toEqual({ x: 0, y: 0 });
    expect(state.items['x1']?.pos).toEqual({ x: 200, y: 110 });
    expect(events).toContainEqual({
      type: 'otterStunned',
      playerId: 'otter-2',
      durationMs: THROWN_FISH_STUN_MS,
      cause: 'thrownFish',
    });
  });

  it('stunned otters cannot act (commands rejected with reason stunned) and stay put', () => {
    let s = carrying('fish');
    s = placeOtter(s, 'otter-2', 200, 100);
    ({ state: s } = run(s, [{ type: 'throwItem', playerId: 'otter-1' }]));
    const { state, events } = run(s, [{ type: 'move', playerId: 'otter-2', dir: 'left' }]);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-2',
      command: 'move',
      reason: 'stunned',
    });
    expect(otter(state, 'otter-2').pos).toEqual({ x: 200, y: 100 });
  });

  it('the stun wears off after THROWN_FISH_STUN_MS and commands work again', () => {
    let s = carrying('fish');
    s = placeOtter(s, 'otter-2', 200, 100);
    ({ state: s } = run(s, [{ type: 'throwItem', playerId: 'otter-1' }]));
    const ticks = Math.ceil(THROWN_FISH_STUN_MS / TICK_MS);
    for (let i = 0; i < ticks; i++) ({ state: s } = run(s, []));
    expect(otter(s, 'otter-2').stunnedMs).toBe(0);
    const { events } = run(s, [{ type: 'move', playerId: 'otter-2', dir: 'left' }]);
    expect(events).toContainEqual({ type: 'otterMoved', playerId: 'otter-2', dir: 'left' });
  });

  it('a thrown branch lands but stuns nobody', () => {
    let s = carrying('branch');
    s = placeOtter(s, 'otter-2', 200, 100);
    const { state, events } = run(s, [{ type: 'throwItem', playerId: 'otter-1' }]);
    expect(otter(state, 'otter-2').stunnedMs).toBe(0);
    expect(state.items['x1']?.pos).toEqual({ x: 100 + THROW_DISTANCE, y: 100 });
    expect(events.some((e) => e.type === 'otterStunned')).toBe(false);
  });

  it('throwItem with empty paws is rejected', () => {
    const s = setup([]);
    const { events } = run(s, [{ type: 'throwItem', playerId: 'otter-1' }]);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-1',
      command: 'throwItem',
      reason: 'notCarrying',
    });
  });
});

/* ------------------------------------------------------------------ */

describe('stone: heavy but worth more dam progress', () => {
  it('carrying a stone halves movement speed; dropping it restores it', () => {
    let s = setup([{ id: 's1', type: 'stone', pos: { x: 100, y: 100 } }]);
    s = placeOtter(s, 'otter-1', 100, 100);
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    const before = otter(s, 'otter-1').pos.x;
    ({ state: s } = run(s, [{ type: 'move', playerId: 'otter-1', dir: 'right' }]));
    expect(otter(s, 'otter-1').pos.x - before).toBeCloseTo(
      200 * STONE_CARRY_SPEED_MULT * (TICK_MS / 1000),
    );
    // drop it, walk again: full speed
    ({ state: s } = run(s, [{ type: 'drop', playerId: 'otter-1' }]));
    const x1 = otter(s, 'otter-1').pos.x;
    ({ state: s } = run(s, [{ type: 'move', playerId: 'otter-1', dir: 'right' }]));
    expect(otter(s, 'otter-1').pos.x - x1).toBeCloseTo(200 * (TICK_MS / 1000));
  });

  it('building with a stone contributes BUILD_AMOUNTS.stone (3) progress', () => {
    expect(BUILD_AMOUNTS.stone).toBe(3);
    let s = setup([{ id: 's1', type: 'stone', pos: { x: 500, y: 120 } }]);
    s = placeOtter(s, 'otter-1', 500, 120); // dam site is (500, 96)
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    const { state, events } = buildChannel(s);
    expect(state.dam.progress).toBe(3);
    expect(state.otters['otter-1']?.carrying).toBeNull();
    expect(state.items['s1']).toBeUndefined();
    expect(events).toContainEqual({
      type: 'damProgressed',
      playerId: 'otter-1',
      amount: 3,
      progress: 3,
    });
  });

  it('building while carrying a fish is rejected (not a build material)', () => {
    let s = setup([{ id: 'f1', type: 'fish', pos: { x: 500, y: 120 } }]);
    s = placeOtter(s, 'otter-1', 500, 120);
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    const { events } = run(s, [{ type: 'build', playerId: 'otter-1' }]);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-1',
      command: 'build',
      reason: 'noBuildMaterial',
    });
  });
});

/* ------------------------------------------------------------------ */

describe('cone: wearable hat', () => {
  function carryingCone(): GameState {
    let s = setup([
      { id: 'c1', type: 'cone', pos: { x: 100, y: 100 } },
      { id: 'f1', type: 'fish', pos: { x: 300, y: 300 } },
    ]);
    s = placeOtter(s, 'otter-1', 100, 100);
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    return s;
  }

  it('useItem wears the cone: hat set, item consumed, hatWorn emitted', () => {
    const { state, events } = run(carryingCone(), [{ type: 'useItem', playerId: 'otter-1' }]);
    const o = otter(state, 'otter-1');
    expect(o.hat).toBe('cone');
    expect(o.carrying).toBeNull();
    expect(state.items['c1']).toBeUndefined();
    expect(events).toContainEqual({ type: 'hatWorn', playerId: 'otter-1', hat: 'cone' });
  });

  it('cannot stack hats: second cone is rejected', () => {
    let s = carryingCone();
    ({ state: s } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]));
    // hand the otter another cone directly
    s = {
      ...s,
      items: { c2: { id: 'c2', type: 'cone', pos: { x: 100, y: 100 }, heldBy: 'otter-1' } },
      otters: { ...s.otters, 'otter-1': { ...otter(s, 'otter-1'), carrying: 'cone' } },
    };
    const { events } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-1',
      command: 'useItem',
      reason: 'alreadyWearingHat',
    });
  });

  it('getting stunned knocks the hat off as a ground cone item', () => {
    let s = carryingCone();
    ({ state: s } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]));
    // otter-2 picks up the fish and beans otter-1 with it
    s = placeOtter(s, 'otter-2', 300, 300, 'right');
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-2' }]));
    s = placeOtter(s, 'otter-1', 380, 300);
    const { state, events } = run(s, [{ type: 'throwItem', playerId: 'otter-2' }]);
    const o = otter(state, 'otter-1');
    expect(o.stunnedMs).toBeGreaterThan(0);
    expect(o.hat).toBeNull();
    const knocked = events.find((e) => e.type === 'hatKnockedOff');
    expect(knocked).toMatchObject({ playerId: 'otter-1' });
    if (knocked?.type !== 'hatKnockedOff') throw new Error('expected hatKnockedOff');
    expect(state.items[knocked.itemId]).toMatchObject({
      type: 'cone',
      heldBy: null,
      pos: { x: 380, y: 300 },
    });
  });
});

/* ------------------------------------------------------------------ */

describe('mushroom: eat to scale up, stacks to 4 (P4-5)', () => {
  function carryingMushroom(s: GameState, id = 'otter-1'): GameState {
    const itemId = `m-${id}-${Math.random()}`;
    return {
      ...s,
      items: { ...s.items, [itemId]: { id: itemId, type: 'mushroom', pos: otter(s, id).pos, heldBy: id } },
      otters: { ...s.otters, [id]: { ...otter(s, id), carrying: 'mushroom' } },
    };
  }

  it('eating one mushroom sets scale to MUSHROOM_SCALE and stacks to 1', () => {
    let s = setup([]);
    s = placeOtter(s, 'otter-1', 100, 100);
    s = carryingMushroom(s);
    const { state, events } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]);
    const o = otter(state, 'otter-1');
    expect(o.mushroomStacks).toBe(1);
    expect(o.scale).toBeCloseTo(MUSHROOM_SCALE);
    expect(o.carrying).toBeNull();
    expect(events).toContainEqual({
      type: 'itemEaten',
      playerId: 'otter-1',
      itemId: expect.any(String),
      itemType: 'mushroom',
    });
  });

  it('stacks multiplicatively up to MAX_MUSHROOM_STACKS (4): scale == MUSHROOM_SCALE ** stacks', () => {
    let s = setup([]);
    s = placeOtter(s, 'otter-1', 100, 100);
    for (let i = 0; i < MAX_MUSHROOM_STACKS; i++) {
      s = carryingMushroom(s);
      ({ state: s } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]));
    }
    const o = otter(s, 'otter-1');
    expect(o.mushroomStacks).toBe(MAX_MUSHROOM_STACKS);
    expect(o.scale).toBeCloseTo(MUSHROOM_SCALE ** MAX_MUSHROOM_STACKS);
  });

  it('a 5th+ mushroom still emits itemEaten but scale/stacks stop changing past the cap', () => {
    let s = setup([]);
    s = placeOtter(s, 'otter-1', 100, 100);
    for (let i = 0; i < MAX_MUSHROOM_STACKS; i++) {
      s = carryingMushroom(s);
      ({ state: s } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]));
    }
    const capScale = otter(s, 'otter-1').scale;
    s = carryingMushroom(s);
    const { state, events } = run(s, [{ type: 'useItem', playerId: 'otter-1' }]);
    const o = otter(state, 'otter-1');
    expect(o.mushroomStacks).toBe(MAX_MUSHROOM_STACKS);
    expect(o.scale).toBeCloseTo(capScale!);
    expect(o.scale).toBeCloseTo(MUSHROOM_SCALE ** MAX_MUSHROOM_STACKS);
    expect(events).toContainEqual({
      type: 'itemEaten',
      playerId: 'otter-1',
      itemId: expect.any(String),
      itemType: 'mushroom',
    });
  });
});

/* ------------------------------------------------------------------ */

describe('dirt: dig command and pits', () => {
  it('an empty-handed otter digs up a dirt item at its feet and leaves a pit', () => {
    let s = setup([]);
    s = placeOtter(s, 'otter-1', 400, 400);
    s = { ...s, rngSeed: POOP_ROLL_SEED }; // pin the loot roll to the 'poop' bucket
    const { state, events } = run(s, [{ type: 'dig', playerId: 'otter-1' }]);
    const dug = events.find((e) => e.type === 'dugDirt');
    expect(dug).toMatchObject({ playerId: 'otter-1', pos: { x: 400, y: 400 } });
    if (dug?.type !== 'dugDirt') throw new Error('expected dugDirt');
    expect(state.items[dug.itemId]).toMatchObject({
      type: 'dirt',
      heldBy: null,
      pos: { x: 400, y: 400 },
    });
    expect(state.pits).toHaveLength(1);
    expect(state.pits[0]).toMatchObject({ pos: { x: 400, y: 400 }, diggerId: 'otter-1' });
    expect(events.some((e) => e.type === 'pitCreated')).toBe(true);
  });

  it('digging with full paws is rejected', () => {
    let s = setup([{ id: 'b1', type: 'branch', pos: { x: 100, y: 100 } }]);
    s = placeOtter(s, 'otter-1', 100, 100);
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    s = { ...s, rngSeed: POOP_ROLL_SEED };
    const { state, events } = run(s, [{ type: 'dig', playerId: 'otter-1' }]);
    expect(events).toContainEqual({
      type: 'commandRejected',
      playerId: 'otter-1',
      command: 'dig',
      reason: 'handsFull',
    });
    expect(state.pits).toHaveLength(0);
  });

  it('dug dirt is a build material worth 1 progress', () => {
    expect(BUILD_AMOUNTS.dirt).toBe(1);
    let s = setup([]);
    s = placeOtter(s, 'otter-1', 500, 120); // within BUILD_RADIUS of the dam
    s = { ...s, rngSeed: POOP_ROLL_SEED };
    ({ state: s } = run(s, [{ type: 'dig', playerId: 'otter-1' }]));
    ({ state: s } = run(s, [{ type: 'pickUp', playerId: 'otter-1' }]));
    expect(otter(s, 'otter-1').carrying).toBe('dirt');
    const { state } = buildChannel(s);
    expect(state.dam.progress).toBe(1);
  });

  it('another otter in the pit radius falls in: stunned, pit fills', () => {
    let s = setup([]);
    s = placeOtter(s, 'otter-1', 400, 400);
    s = placeOtter(s, 'otter-2', 400 + PIT_RADIUS - 1, 400);
    s = { ...s, rngSeed: POOP_ROLL_SEED };
    const { state, events } = run(s, [{ type: 'dig', playerId: 'otter-1' }]);
    expect(otter(state, 'otter-2').stunnedMs).toBe(PIT_STUN_MS);
    expect(otter(state, 'otter-1').stunnedMs).toBe(0); // digger has grace
    expect(state.pits).toHaveLength(0); // pit filled by the victim
    expect(events).toContainEqual({
      type: 'otterStunned',
      playerId: 'otter-2',
      durationMs: PIT_STUN_MS,
      cause: 'pit',
    });
    expect(events.some((e) => e.type === 'pitFilled')).toBe(true);
  });

  it('the digger is immune for PIT_DIGGER_IMMUNE_MS, then falls into their own pit', () => {
    let s = setup([]);
    // move the other otters far away from the pit
    s = placeOtter(s, 'otter-2', 50, 50);
    s = placeOtter(s, 'otter-3', 950, 50);
    s = placeOtter(s, 'otter-1', 400, 400);
    s = { ...s, rngSeed: POOP_ROLL_SEED };
    ({ state: s } = run(s, [{ type: 'dig', playerId: 'otter-1' }]));
    // stand on the pit through the whole grace period
    const graceTicks = Math.ceil(PIT_DIGGER_IMMUNE_MS / TICK_MS);
    for (let i = 0; i < graceTicks - 1; i++) {
      ({ state: s } = run(s, []));
      expect(otter(s, 'otter-1').stunnedMs).toBe(0);
    }
    const { state, events } = run(s, []); // grace expires this tick
    expect(otter(state, 'otter-1').stunnedMs).toBe(PIT_STUN_MS);
    expect(state.pits).toHaveLength(0);
    expect(events).toContainEqual({
      type: 'otterStunned',
      playerId: 'otter-1',
      durationMs: PIT_STUN_MS,
      cause: 'pit',
    });
  });
});
