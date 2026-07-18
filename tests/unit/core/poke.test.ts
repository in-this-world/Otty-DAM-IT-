/**
 * P2-02: poke (戳人) — knock an item loose + grant the victim i-frames.
 * P4-1: a poke now requires the attacker to be carrying a branch ("stick");
 * empty-handed/non-branch pokes are a no-op that surfaces hint.needStick.
 */
import { describe, expect, it } from 'vitest';
import { applyPoke, POKE_INVULN_MS, POKE_RADIUS, POKE_STUN_MS } from '../../../src/core/poke';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/tick';
import type { GameEvent, GameState, ItemType, OtterState } from '../../../src/core/types';

const WORLD = { width: 1000, height: 800 };

function twoOtters(opts: {
  attackerPos: { x: number; y: number };
  targetPos: { x: number; y: number };
  targetCarries?: boolean;
  targetInvuln?: number;
  attackerStunned?: number;
  attackerCarrying?: ItemType | null;
}): GameState {
  const s = createInitialState({
    playerCount: 2,
    seed: 1,
    world: WORLD,
    items: opts.targetCarries ? [{ id: 'b1', type: 'branch', pos: opts.targetPos }] : [],
  });
  const a = s.otters['otter-1'];
  const t = s.otters['otter-2'];
  if (!a || !t) throw new Error('missing otters');
  // Default to the attacker carrying a branch (stick) so pre-existing poke
  // behavior tests (written before P4-1) keep passing unchanged.
  const attackerCarrying = opts.attackerCarrying === undefined ? 'branch' : opts.attackerCarrying;
  const otters: Record<string, OtterState> = {
    'otter-1': {
      ...a,
      pos: opts.attackerPos,
      stunnedMs: opts.attackerStunned ?? 0,
      carrying: attackerCarrying,
    },
    'otter-2': {
      ...t,
      pos: opts.targetPos,
      carrying: opts.targetCarries ? 'branch' : null,
      invulnMs: opts.targetInvuln ?? 0,
    },
  };
  const items: Record<string, GameState['items'][string]> = opts.targetCarries
    ? { b1: { id: 'b1', type: 'branch', pos: opts.targetPos, heldBy: 'otter-2' } }
    : {};
  if (attackerCarrying !== null) {
    items['stick-a'] = { id: 'stick-a', type: attackerCarrying, pos: opts.attackerPos, heldBy: 'otter-1' };
  }
  return { ...s, otters, items };
}

describe('P2-02 poke', () => {
  it('knocks the carried item loose and grants the victim i-frames', () => {
    const s = twoOtters({
      attackerPos: { x: 100, y: 100 },
      targetPos: { x: 100 + POKE_RADIUS - 6, y: 100 },
      targetCarries: true,
    });
    const events: GameEvent[] = [];
    const next = applyPoke(s, s.otters['otter-1']!, events);

    const victim = next.otters['otter-2']!;
    expect(victim.carrying).toBeNull();
    expect(victim.invulnMs).toBe(POKE_INVULN_MS);
    // brief stagger stun + knockback away from the attacker (visible feedback)
    expect(victim.stunnedMs).toBeGreaterThanOrEqual(POKE_STUN_MS);
    expect(victim.pos.x).toBeGreaterThan(100 + POKE_RADIUS - 6); // shoved right, away from attacker at x=100
    expect(events.some((e) => e.type === 'otterStunned' && e.cause === 'poke')).toBe(true);
    expect(next.otters['otter-1']!.action).toBe('poke');
    const item = next.items['b1']!;
    expect(item.heldBy).toBeNull();
    expect(item.pos).toEqual({ x: 100 + POKE_RADIUS - 6, y: 100 });
    expect(events.some((e) => e.type === 'otterPoked' && e.targetId === 'otter-2')).toBe(true);
    expect(events.some((e) => e.type === 'itemDropped' && e.itemId === 'b1')).toBe(true);
  });

  it('poking an empty-handed otter still grants i-frames, drops nothing', () => {
    const s = twoOtters({
      attackerPos: { x: 100, y: 100 },
      targetPos: { x: 120, y: 100 },
      targetCarries: false,
    });
    const events: GameEvent[] = [];
    const next = applyPoke(s, s.otters['otter-1']!, events);
    expect(next.otters['otter-2']!.invulnMs).toBe(POKE_INVULN_MS);
    expect(events.some((e) => e.type === 'itemDropped')).toBe(false);
    expect(events.some((e) => e.type === 'otterPoked' && e.targetId === 'otter-2')).toBe(true);
  });

  it('a whiff (nobody in reach) plays the poke anim and reports targetId null', () => {
    const s = twoOtters({
      attackerPos: { x: 100, y: 100 },
      targetPos: { x: 100 + POKE_RADIUS + 40, y: 100 },
      targetCarries: true,
    });
    const events: GameEvent[] = [];
    const next = applyPoke(s, s.otters['otter-1']!, events);
    expect(next.otters['otter-1']!.action).toBe('poke');
    expect(next.otters['otter-2']!.carrying).toBe('branch'); // untouched
    expect(events.some((e) => e.type === 'otterPoked' && e.targetId === null)).toBe(true);
  });

  it('an invulnerable victim shrugs the poke off (immune)', () => {
    const s = twoOtters({
      attackerPos: { x: 100, y: 100 },
      targetPos: { x: 120, y: 100 },
      targetCarries: true,
      targetInvuln: 900,
    });
    const events: GameEvent[] = [];
    const next = applyPoke(s, s.otters['otter-1']!, events);
    expect(next.otters['otter-2']!.carrying).toBe('branch');
    expect(next.otters['otter-2']!.invulnMs).toBe(900); // not refreshed
    expect(next.items['b1']!.heldBy).toBe('otter-2');
    expect(events.some((e) => e.type === 'itemDropped')).toBe(false);
    expect(events.some((e) => e.type === 'otterPoked' && e.targetId === 'otter-2')).toBe(true);
  });

  it('i-frames decay over time (effects) and the otter becomes pokeable again', () => {
    let s = twoOtters({
      attackerPos: { x: 100, y: 100 },
      targetPos: { x: 120, y: 100 },
      targetCarries: false,
      targetInvuln: POKE_INVULN_MS,
    });
    // 40 idle ticks * 50ms = 2000ms -> invuln fully decays
    for (let i = 0; i < 40; i++) s = reduce(s, [], 50).state;
    expect(s.otters['otter-2']!.invulnMs ?? 0).toBe(0);
  });

  it('through reduce(): a poke command drops the victim item and stuns farming', () => {
    const s = twoOtters({
      attackerPos: { x: 200, y: 200 },
      targetPos: { x: 220, y: 200 },
      targetCarries: true,
    });
    const { state: next, events } = reduce(s, [{ type: 'poke', playerId: 'otter-1' }], 50);
    expect(next.otters['otter-2']!.carrying).toBeNull();
    expect((next.otters['otter-2']!.invulnMs ?? 0)).toBeGreaterThan(0); // set 2000, decayed one tick
    expect(next.items['b1']!.heldBy).toBeNull();
    expect(events.some((e) => e.type === 'itemDropped')).toBe(true);
  });

  it('a stunned attacker cannot poke (command rejected)', () => {
    const s = twoOtters({
      attackerPos: { x: 200, y: 200 },
      targetPos: { x: 220, y: 200 },
      targetCarries: true,
      attackerStunned: 400,
    });
    const { state: next, events } = reduce(s, [{ type: 'poke', playerId: 'otter-1' }], 50);
    expect(next.otters['otter-2']!.carrying).toBe('branch'); // untouched
    expect(
      events.some((e) => e.type === 'commandRejected' && e.reason === 'stunned'),
    ).toBe(true);
  });

  /* -------------------- P4-1: poke requires a stick -------------------- */

  it('an empty-handed attacker cannot poke: no effect, commandRejected noStick', () => {
    const s = twoOtters({
      attackerPos: { x: 100, y: 100 },
      targetPos: { x: 120, y: 100 },
      targetCarries: true,
      attackerCarrying: null,
    });
    const before = s.otters['otter-2']!;
    const events: GameEvent[] = [];
    let rejected: string | null = null;
    const next = applyPoke(s, s.otters['otter-1']!, events, (reason) => { rejected = reason; });

    // No target search / effect at all: victim state is byte-identical.
    expect(next.otters['otter-2']).toEqual(before);
    expect(next.otters['otter-1']!.action).not.toBe('poke');
    expect(next.otters['otter-1']).toEqual(s.otters['otter-1']);
    expect(next.items).toEqual(s.items);
    expect(events.some((e) => e.type === 'otterPoked')).toBe(false);
    expect(rejected).toBe('noStick');
  });

  it('an attacker carrying a non-branch item (e.g. a fish) cannot poke', () => {
    const s = twoOtters({
      attackerPos: { x: 100, y: 100 },
      targetPos: { x: 120, y: 100 },
      targetCarries: true,
      attackerCarrying: 'fish',
    });
    const before = s.otters['otter-2']!;
    const events: GameEvent[] = [];
    let rejected: string | null = null;
    const next = applyPoke(s, s.otters['otter-1']!, events, (reason) => { rejected = reason; });
    expect(next.otters['otter-2']).toEqual(before);
    expect(events.some((e) => e.type === 'otterPoked')).toBe(false);
    expect(rejected).toBe('noStick');
  });

  it('through reduce(): a stickless poke command is rejected, no otterPoked event', () => {
    const s = twoOtters({
      attackerPos: { x: 200, y: 200 },
      targetPos: { x: 220, y: 200 },
      targetCarries: true,
      attackerCarrying: null,
    });
    const { state: next, events } = reduce(s, [{ type: 'poke', playerId: 'otter-1' }], 50);
    expect(next.otters['otter-2']!.carrying).toBe('branch'); // untouched
    expect(events.some((e) => e.type === 'otterPoked')).toBe(false);
    expect(
      events.some((e) => e.type === 'commandRejected' && e.reason === 'noStick'),
    ).toBe(true);
  });
});
