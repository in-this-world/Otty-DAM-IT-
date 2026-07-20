/**
 * P2-04 突發事件 (sudden events): 🦅 eagle + 🐻 bear state machines.
 * Covers every path of both machines plus the deterministic scheduler and
 * the reduce() pipeline wiring.
 */
import { describe, expect, it } from 'vitest';
import { applyPoke } from '../../../src/core/poke';
import { applyThrow } from '../../../src/core/items';
import {
  BEAR_EAT_RADIUS,
  EAGLE_CARRY_MS,
  EAGLE_FREEZE_MS,
  eagleDropPoint,
  repelEagle,
  BEAR_LEAVE_MS,
  BEAR_LIFETIME_MS,
  BEAR_STUN_MS,
  EAGLE_SWOOP_MS,
  EAGLE_WARNING_MS,
  hazardSystem,
  pickEagleTarget,
  spawnBear,
  spawnEagle,
  stepBear,
  stepEagle,
} from '../../../src/core/hazards';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type {
  BearState,
  EagleState,
  GameEvent,
  GameState,
  ItemState,
  OtterState,
} from '../../../src/core/types';

const WORLD = { width: 1000, height: 800 };

/** One-otter state with fine control over position / carry / hat / water. */
function oneOtter(opts: {
  pos: { x: number; y: number };
  carries?: boolean;
  hat?: 'cone' | null;
  floating?: boolean;
  items?: readonly { id: string; type: ItemState['type']; pos: { x: number; y: number } }[];
}): GameState {
  const s = createInitialState({
    playerCount: 1,
    seed: 7,
    world: WORLD,
    items: opts.carries ? [{ id: 'b1', type: 'branch', pos: opts.pos }] : (opts.items ?? []),
  });
  const o = s.otters['otter-1']!;
  const otters: Record<string, OtterState> = {
    'otter-1': {
      ...o,
      pos: opts.pos,
      carrying: opts.carries ? 'branch' : null,
      hat: opts.hat ?? null,
      floating: opts.floating ?? false,
    },
  };
  const items: Record<string, ItemState> = {};
  if (opts.carries) items['b1'] = { id: 'b1', type: 'branch', pos: opts.pos, heldBy: 'otter-1' };
  for (const it of opts.items ?? []) items[it.id] = { ...it, heldBy: null };
  return { ...s, otters, items };
}

/* ------------------------------- eagle ---------------------------------- */

describe('P2-04 eagle', () => {
  it('pickEagleTarget prefers an otter that is carrying', () => {
    const s = createInitialState({ playerCount: 2, seed: 1, world: WORLD, items: [] });
    const withCarry: GameState = {
      ...s,
      otters: {
        'otter-1': { ...s.otters['otter-1']!, carrying: null },
        'otter-2': { ...s.otters['otter-2']!, carrying: 'branch' },
      },
    };
    expect(pickEagleTarget(withCarry)).toBe('otter-2');
  });

  it('spawns in the warning phase over the target and emits eagleWarning', () => {
    const s = oneOtter({ pos: { x: 300, y: 300 }, carries: true });
    const events: GameEvent[] = [];
    const eagle = spawnEagle(s, events);
    expect(eagle.phase).toBe('warning');
    expect(eagle.targetId).toBe('otter-1');
    expect(eagle.timerMs).toBe(EAGLE_WARNING_MS);
    expect(eagle.pos).toEqual({ x: 300, y: 300 });
    expect(events.some((e) => e.type === 'eagleWarning' && e.targetId === 'otter-1')).toBe(true);
  });

  it('warning shadow tracks the target as it moves', () => {
    const s0 = oneOtter({ pos: { x: 100, y: 100 }, carries: true });
    const eagle: EagleState = { phase: 'warning', targetId: 'otter-1', pos: { x: 100, y: 100 }, timerMs: EAGLE_WARNING_MS };
    const moved: GameState = { ...s0, otters: { 'otter-1': { ...s0.otters['otter-1']!, pos: { x: 250, y: 180 } } } };
    const r = stepEagle(moved, eagle, 50, []);
    expect(r.hazard!.phase).toBe('warning');
    expect(r.hazard!.pos).toEqual({ x: 250, y: 180 });
    expect(r.hazard!.timerMs).toBe(EAGLE_WARNING_MS - 50);
  });

  it('P2-13: the swoop GRABS the otter — held item drops at the grab point, carry begins', () => {
    const s = oneOtter({ pos: { x: 300, y: 300 }, carries: true });
    const eagle: EagleState = { phase: 'warning', targetId: 'otter-1', pos: { x: 300, y: 300 }, timerMs: 20 };
    const events: GameEvent[] = [];
    const r = stepEagle(s, eagle, 50, events);
    expect(r.hazard!.phase).toBe('carry');
    expect(r.hazard!.victimId).toBe('otter-1');
    expect(r.otters!['otter-1']!.carrying).toBeNull();
    expect(r.items!['b1']).toMatchObject({ heldBy: null, pos: { x: 300, y: 300 } }); // dropped, not stolen
    expect(events.some((e) => e.type === 'eagleSwooped' && e.grabbed === true && e.itemId === 'b1')).toBe(true);
    expect(events.some((e) => e.type === 'otterGrabbed' && e.playerId === 'otter-1')).toBe(true);
  });

  it('a target wearing a cone is immune (grabbed=false, keeps item)', () => {
    const s = oneOtter({ pos: { x: 300, y: 300 }, carries: true, hat: 'cone' });
    const eagle: EagleState = { phase: 'warning', targetId: 'otter-1', pos: { x: 300, y: 300 }, timerMs: 20 };
    const events: GameEvent[] = [];
    const r = stepEagle(s, eagle, 50, events);
    expect(r.hazard!.phase).toBe('swoop');
    expect(r.otters).toBeUndefined(); // untouched
    expect(s.items['b1']).toBeDefined();
    expect(events.some((e) => e.type === 'eagleSwooped' && e.grabbed === false)).toBe(true);
  });

  it('a target floating in water dodges (grabbed=false)', () => {
    const s = oneOtter({ pos: { x: 300, y: 300 }, carries: true, floating: true });
    const eagle: EagleState = { phase: 'warning', targetId: 'otter-1', pos: { x: 300, y: 300 }, timerMs: 20 };
    const events: GameEvent[] = [];
    stepEagle(s, eagle, 50, events);
    expect(events.some((e) => e.type === 'eagleSwooped' && e.grabbed === false)).toBe(true);
    expect(s.items['b1']).toBeDefined();
  });

  it('P2-13: an empty-handed target is still grabbed (no item drops)', () => {
    const s = oneOtter({ pos: { x: 300, y: 300 }, carries: false });
    const eagle: EagleState = { phase: 'warning', targetId: 'otter-1', pos: { x: 300, y: 300 }, timerMs: 20 };
    const events: GameEvent[] = [];
    const r = stepEagle(s, eagle, 50, events);
    expect(r.hazard!.phase).toBe('carry');
    expect(events.some((e) => e.type === 'eagleSwooped' && e.grabbed === true && e.itemId === null)).toBe(true);
  });

  it('the swoop beat despawns the eagle after EAGLE_SWOOP_MS', () => {
    const s = oneOtter({ pos: { x: 300, y: 300 } });
    const eagle: EagleState = { phase: 'swoop', targetId: 'otter-1', pos: { x: 300, y: 300 }, timerMs: 30 };
    expect(stepEagle(s, eagle, 20, []).hazard!.phase).toBe('swoop'); // 30 -> 10
    expect(stepEagle(s, eagle, EAGLE_SWOOP_MS, []).hazard).toBeNull(); // elapsed
  });
});

/* -------------------------------- bear ---------------------------------- */

describe('P2-04 bear', () => {
  it('spawns at the forest edge in the approach phase and emits bearAppeared', () => {
    const s = oneOtter({ pos: { x: 500, y: 400 } });
    const events: GameEvent[] = [];
    const bear = spawnBear(s, events);
    expect(bear.phase).toBe('approach');
    expect(bear.pos).toEqual({ x: WORLD.width / 2, y: 0 });
    expect(bear.timerMs).toBe(BEAR_LIFETIME_MS);
    expect(events.some((e) => e.type === 'bearAppeared')).toBe(true);
  });

  it('charges the nearest otter and swats it: drop + bear-stun + knockback', () => {
    const s = oneOtter({ pos: { x: 500, y: 400 }, carries: true });
    const bear: BearState = {
      phase: 'approach',
      pos: { x: 500 + 40, y: 400 }, // within a step of hit radius
      targetOtterId: null,
      targetItemId: null,
      timerMs: BEAR_LIFETIME_MS,
    };
    const events: GameEvent[] = [];
    const r = stepBear(s, bear, 50, events);
    const victim = r.otters!['otter-1']!;
    expect(victim.carrying).toBeNull();
    expect(victim.stunnedMs).toBeGreaterThanOrEqual(BEAR_STUN_MS);
    expect(victim.pos.x).toBeLessThan(500); // knocked away from the bear (which is to the right)
    expect(r.items!['b1']!.heldBy).toBeNull(); // dropped at feet
    expect(events.some((e) => e.type === 'bearHitOtter' && e.playerId === 'otter-1')).toBe(true);
    expect(events.some((e) => e.type === 'otterStunned' && e.cause === 'bear')).toBe(true);
    expect(r.hazard!.phase).toBe('approach'); // keeps roaming after a swat
  });

  it('is lured by a ground fish: eats it and switches to leaving', () => {
    const s = oneOtter({
      pos: { x: 900, y: 700 }, // otter far away
      items: [{ id: 'f1', type: 'fish', pos: { x: 120, y: 100 } }],
    });
    const bear: BearState = {
      phase: 'approach',
      pos: { x: 120 + BEAR_EAT_RADIUS - 5, y: 100 },
      targetOtterId: null,
      targetItemId: null,
      timerMs: BEAR_LIFETIME_MS,
    };
    const events: GameEvent[] = [];
    const r = stepBear(s, bear, 50, events);
    expect(r.items!['f1']).toBeUndefined(); // eaten
    expect(r.hazard!.phase).toBe('leaving');
    expect(events.some((e) => e.type === 'bearLured' && e.itemId === 'f1')).toBe(true);
  });

  it('prioritises a fish over an otter even when the otter is closer', () => {
    const s = oneOtter({
      pos: { x: 210, y: 200 }, // otter near the bear
      items: [{ id: 'f1', type: 'fish', pos: { x: 600, y: 200 } }], // fish far
    });
    const bear: BearState = {
      phase: 'approach',
      pos: { x: 200, y: 200 },
      targetOtterId: null,
      targetItemId: null,
      timerMs: BEAR_LIFETIME_MS,
    };
    const r = stepBear(s, bear, 50, []);
    expect(r.hazard!.targetItemId).toBe('f1'); // heading for the fish, not the otter
    expect(r.hazard!.pos.x).toBeGreaterThan(200); // moved toward the fish (to the right)
  });

  it('wanders off (approach -> leaving) once its lifetime expires', () => {
    const s = oneOtter({ pos: { x: 500, y: 400 } });
    const bear: BearState = {
      phase: 'approach',
      pos: { x: 500, y: 100 },
      targetOtterId: null,
      targetItemId: null,
      timerMs: 30,
    };
    const r = stepBear(s, bear, 50, []);
    expect(r.hazard!.phase).toBe('leaving');
    expect(r.hazard!.timerMs).toBe(BEAR_LEAVE_MS);
  });

  it('despawns after the leaving beat and emits bearLeft', () => {
    const s = oneOtter({ pos: { x: 500, y: 400 } });
    const bear: BearState = { phase: 'leaving', pos: { x: 500, y: 200 }, targetOtterId: null, targetItemId: null, timerMs: 30 };
    const events: GameEvent[] = [];
    const r = stepBear(s, bear, 50, events);
    expect(r.hazard).toBeNull();
    expect(events.some((e) => e.type === 'bearLeft')).toBe(true);
  });
});

/* ---------------------------- scheduler / system ------------------------ */

describe('P2-04 hazard scheduler + system', () => {
  it('no hazards config => state.hazards is absent and hazardSystem is a no-op', () => {
    const s = createInitialState({ playerCount: 1, seed: 1, world: WORLD });
    expect(s.hazards).toBeUndefined();
    expect(hazardSystem(s, 50, [])).toBe(s); // identity
  });

  it('an explicit schedule converts atElapsedMs -> atTimerMs and fires in order', () => {
    const s = createInitialState({
      playerCount: 1,
      seed: 1,
      world: WORLD,
      timerMs: 10_000,
      hazards: { schedule: [{ kind: 'bear', atElapsedMs: 5000 }, { kind: 'eagle', atElapsedMs: 2000 }] },
    });
    // earliest-in-round (eagle @2000 => atTimerMs 8000) sorts first (descending atTimerMs)
    expect(s.hazards!.schedule.map((x) => x.kind)).toEqual(['eagle', 'bear']);
    expect(s.hazards!.schedule[0]!.atTimerMs).toBe(8000);
  });

  it('a random enabled schedule is deterministic for a given seed', () => {
    const cfg = { playerCount: 3, seed: 42, world: WORLD, hazards: { enabled: true } };
    const a = createInitialState(cfg);
    const b = createInitialState(cfg);
    expect(a.hazards!.schedule).toEqual(b.hazards!.schedule);
    expect(a.hazards!.schedule.length).toBeGreaterThanOrEqual(1);
  });

  it('through reduce(): a scheduled eagle spawns, warns, then grabs the carried item', () => {
    let s = createInitialState({
      playerCount: 1,
      seed: 3,
      world: WORLD,
      timerMs: 60_000,
      items: [{ id: 'b1', type: 'branch', pos: { x: 400, y: 400 } }],
      hazards: { schedule: [{ kind: 'eagle', atElapsedMs: 100 }] },
    });
    s = {
      ...s,
      otters: { 'otter-1': { ...s.otters['otter-1']!, pos: { x: 400, y: 400 }, carrying: 'branch' } },
      items: { b1: { id: 'b1', type: 'branch', pos: { x: 400, y: 400 }, heldBy: 'otter-1' } },
    };

    const seen: GameEvent['type'][] = [];
    // ~6s of ticks: spawn + 3000ms warning + 2000ms carry (P2-13) + swoop
    for (let i = 0; i < 120; i++) {
      const r = reduce(s, [], 50);
      s = r.state;
      for (const e of r.events) seen.push(e.type);
    }
    expect(seen).toContain('eagleWarning');
    expect(seen).toContain('eagleSwooped');
    expect(seen).toContain('otterGrabbed');
    expect(seen).toContain('otterDropped');
    expect(s.otters['otter-1']!.carrying).toBeNull(); // dropped at the grab point
    expect(s.items['b1']).toMatchObject({ heldBy: null }); // P2-13: stays in the world
    expect(s.otters['otter-1']!.stunnedMs).toBeGreaterThan(0); // frozen after the drop
    expect(s.hazards!.eagle).toBeNull(); // whole machine ran to completion
    expect(s.hazards!.schedule).toHaveLength(0);
  });
});

/* --------------------------- P2-13 grab + repel -------------------------- */

describe('P2-13 eagle carry / drop / repel', () => {
  const grabAt = { x: 300, y: 300 };

  function carriedState(): { s: GameState; eagle: EagleState } {
    const s = oneOtter({ pos: grabAt, carries: false });
    const eagle: EagleState = {
      phase: 'carry',
      targetId: 'otter-1',
      victimId: 'otter-1',
      pos: grabAt,
      timerMs: EAGLE_CARRY_MS,
      dropAt: eagleDropPoint(s, grabAt),
    };
    return { s, eagle };
  }

  it('carries the victim along (position follows, controls blocked)', () => {
    const { s, eagle } = carriedState();
    const r = stepEagle(s, eagle, 50, []);
    expect(r.hazard!.phase).toBe('carry');
    expect(r.hazard!.pos).not.toEqual(grabAt); // flying toward dropAt
    expect(r.otters!['otter-1']!.pos).toEqual(r.hazard!.pos); // dangling
    expect(r.otters!['otter-1']!.stunnedMs).toBeGreaterThan(0);
  });

  it('drops the victim after EAGLE_CARRY_MS with the freeze applied', () => {
    const { s, eagle } = carriedState();
    const events: GameEvent[] = [];
    const r = stepEagle(s, { ...eagle, timerMs: 10 }, 50, events);
    expect(r.hazard!.phase).toBe('swoop'); // leave beat
    expect(r.otters!['otter-1']!.stunnedMs).toBe(EAGLE_FREEZE_MS);
    expect(events.some((e) => e.type === 'otterDropped')).toBe(true);
    expect(
      events.some((e) => e.type === 'otterStunned' && e.cause === 'eagle' && e.durationMs === EAGLE_FREEZE_MS),
    ).toBe(true);
  });

  it('repelEagle releases the captive WITHOUT the freeze and emits hazardRepelled', () => {
    const { s, eagle } = carriedState();
    const events: GameEvent[] = [];
    const r = repelEagle(s, eagle, 'otter-2', events);
    expect(r.hazard!.phase).toBe('swoop');
    expect(r.otters!['otter-1']!.stunnedMs).toBe(0);
    expect(events.some((e) => e.type === 'hazardRepelled' && e.kind === 'eagle')).toBe(true);
    expect(events.some((e) => e.type === 'otterDropped')).toBe(true);
    expect(events.some((e) => e.type === 'otterStunned')).toBe(false);
  });

  it('a poke with no otter in reach drives off a nearby diving eagle and an approaching bear', () => {
    let s = oneOtter({ pos: grabAt, carries: false });
    const eagle: EagleState = { phase: 'swoop', targetId: null, pos: { x: 320, y: 310 }, timerMs: 400 };
    const bear: BearState = {
      phase: 'approach', pos: { x: 340, y: 280 }, targetOtterId: null, targetItemId: null, timerMs: 9000,
    };
    s = { ...s, hazards: { eagle, bear, schedule: [] } };
    const events: GameEvent[] = [];
    const after = applyPoke(s, s.otters['otter-1']!, events);
    expect(after.hazards!.bear!.phase).toBe('leaving');
    expect(events.filter((e) => e.type === 'hazardRepelled')).toHaveLength(2);
  });

  it('a thrown fish crossing the bear repels it', () => {
    let s = oneOtter({
      pos: { x: 300, y: 300 },
      items: [{ id: 'f1', type: 'fish', pos: { x: 300, y: 300 } }],
    });
    s = {
      ...s,
      otters: { 'otter-1': { ...s.otters['otter-1']!, carrying: 'fish', facing: 'right' } },
      items: { f1: { id: 'f1', type: 'fish', pos: { x: 300, y: 300 }, heldBy: 'otter-1' } },
      hazards: {
        eagle: null,
        bear: { phase: 'approach', pos: { x: 380, y: 300 }, targetOtterId: null, targetItemId: null, timerMs: 9000 },
        schedule: [],
      },
    };
    const events: GameEvent[] = [];
    const after = applyThrow(s, s.otters['otter-1']!, events, () => {});
    expect(after.hazards!.bear!.phase).toBe('leaving');
    expect(events.some((e) => e.type === 'hazardRepelled' && e.kind === 'bear')).toBe(true);
  });
});
