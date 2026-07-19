/**
 * P4-8: per-player stat tallying + title assignment — PURE module, same
 * event-driven pattern as core/tick.ts systems. See src/core/stats.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  accumulateSwimTime,
  assignTitles,
  initStats,
  tallyEvent,
  type PlayerStats,
} from '../../../src/core/stats';
import { createInitialState } from '../../../src/core/state';
import type { GameState } from '../../../src/core/types';

describe('initStats', () => {
  it('returns all-zero stats', () => {
    expect(initStats()).toEqual({
      fishEaten: 0,
      damPieces: 0,
      poopsDug: 0,
      mushrooms: 0,
      swimTime: 0,
      diamonds: 0,
      doodles: 0,
    });
  });
});

describe('tallyEvent', () => {
  function statsWith(otterId: string): Record<string, PlayerStats> {
    return { [otterId]: initStats() };
  }

  it('itemEaten fish increments fishEaten', () => {
    const stats = tallyEvent(statsWith('otter-1'), {
      type: 'itemEaten',
      playerId: 'otter-1',
      itemId: 'fish-1',
      itemType: 'fish',
    });
    expect(stats['otter-1']!.fishEaten).toBe(1);
  });

  it('itemEaten mushroom increments mushrooms (eaten, not dug)', () => {
    const stats = tallyEvent(statsWith('otter-1'), {
      type: 'itemEaten',
      playerId: 'otter-1',
      itemId: 'mush-1',
      itemType: 'mushroom',
    });
    expect(stats['otter-1']!.mushrooms).toBe(1);
  });

  it('itemEaten other item types do not affect stats', () => {
    const stats = tallyEvent(statsWith('otter-1'), {
      type: 'itemEaten',
      playerId: 'otter-1',
      itemId: 'branch-1',
      itemType: 'branch',
    });
    expect(stats['otter-1']).toEqual(initStats());
  });

  it('damProgressed increments damPieces by 1 occurrence, regardless of amount', () => {
    let stats = statsWith('otter-1');
    stats = tallyEvent(stats, {
      type: 'damProgressed',
      playerId: 'otter-1',
      amount: 25,
      progress: 25,
    });
    expect(stats['otter-1']!.damPieces).toBe(1);
    stats = tallyEvent(stats, {
      type: 'damProgressed',
      playerId: 'otter-1',
      amount: 3,
      progress: 28,
    });
    expect(stats['otter-1']!.damPieces).toBe(2);
  });

  it('lootRolled poop increments poopsDug', () => {
    const stats = tallyEvent(statsWith('otter-1'), {
      type: 'lootRolled',
      playerId: 'otter-1',
      outcome: 'poop',
      itemId: 'dirt-1',
    });
    expect(stats['otter-1']!.poopsDug).toBe(1);
  });

  it('lootRolled diamond increments diamonds', () => {
    const stats = tallyEvent(statsWith('otter-1'), {
      type: 'lootRolled',
      playerId: 'otter-1',
      outcome: 'diamond',
      scoreAwarded: 50,
    });
    expect(stats['otter-1']!.diamonds).toBe(1);
  });

  it('lootRolled mushroom/vest/hat/nothing do not affect stats (mushroom counted on eat)', () => {
    let stats = statsWith('otter-1');
    for (const outcome of ['mushroom', 'vest', 'hat', 'nothing'] as const) {
      stats = tallyEvent(stats, { type: 'lootRolled', playerId: 'otter-1', outcome });
    }
    expect(stats['otter-1']).toEqual(initStats());
  });

  it('only touches the otter implicated by the event playerId', () => {
    const stats: Record<string, PlayerStats> = {
      'otter-1': initStats(),
      'otter-2': initStats(),
    };
    const next = tallyEvent(stats, {
      type: 'itemEaten',
      playerId: 'otter-1',
      itemId: 'fish-1',
      itemType: 'fish',
    });
    expect(next['otter-1']!.fishEaten).toBe(1);
    expect(next['otter-2']!.fishEaten).toBe(0);
  });

  it('a player with zero events keeps all-zero stats', () => {
    const stats = statsWith('otter-1');
    expect(stats['otter-1']).toEqual(initStats());
  });

  it('otterEnteredWater/otterLeftWater do not mutate stats directly (handled by accumulateSwimTime)', () => {
    let stats = statsWith('otter-1');
    stats = tallyEvent(stats, { type: 'otterEnteredWater', playerId: 'otter-1' });
    stats = tallyEvent(stats, { type: 'otterLeftWater', playerId: 'otter-1' });
    expect(stats['otter-1']!.swimTime).toBe(0);
  });

  it('events for an otter missing from the stats map do not throw and leave the map untouched', () => {
    const stats: Record<string, PlayerStats> = {};
    const next = tallyEvent(stats, {
      type: 'itemEaten',
      playerId: 'otter-9',
      itemId: 'fish-1',
      itemType: 'fish',
    });
    expect(next).toEqual({});
  });
});

describe('accumulateSwimTime', () => {
  function stateWith(floating: Record<string, boolean>): GameState {
    const base = createInitialState({ playerCount: 2, seed: 1 });
    const otters = { ...base.otters };
    for (const [id, isFloating] of Object.entries(floating)) {
      otters[id] = { ...otters[id]!, floating: isFloating };
    }
    return { ...base, otters };
  }

  it('adds dtMs to swimTime for every otter with floating === true', () => {
    const state = stateWith({ 'otter-1': true, 'otter-2': false });
    const stats: Record<string, PlayerStats> = {
      'otter-1': initStats(),
      'otter-2': initStats(),
    };
    const next = accumulateSwimTime(stats, state, 50);
    expect(next['otter-1']!.swimTime).toBe(50);
    expect(next['otter-2']!.swimTime).toBe(0);
  });

  it('accumulates across multiple calls', () => {
    const state = stateWith({ 'otter-1': true });
    let stats: Record<string, PlayerStats> = { 'otter-1': initStats() };
    stats = accumulateSwimTime(stats, state, 50);
    stats = accumulateSwimTime(stats, state, 50);
    expect(stats['otter-1']!.swimTime).toBe(100);
  });

  it('does nothing for otters absent from the stats map', () => {
    const state = stateWith({ 'otter-1': true });
    const stats: Record<string, PlayerStats> = {};
    const next = accumulateSwimTime(stats, state, 50);
    expect(next).toEqual({});
  });
});

describe('assignTitles', () => {
  it('gives 2 players distinct correct titles: fishEaten:9 -> title.fish, damPieces:5 -> title.dam', () => {
    const players = [
      { id: 'otter-1', stats: { ...initStats(), fishEaten: 9 } },
      { id: 'otter-2', stats: { ...initStats(), damPieces: 5 } },
    ];
    const titles = assignTitles(players);
    expect(titles['otter-1']).toBe('title.fish');
    expect(titles['otter-2']).toBe('title.dam');
  });

  it('priority order: fishEaten, damPieces, poopsDug, mushrooms, swimTime', () => {
    const players = [
      {
        id: 'otter-1',
        stats: { ...initStats(), fishEaten: 1, damPieces: 1, poopsDug: 1, mushrooms: 1, swimTime: 1 },
      },
      { id: 'otter-2', stats: { ...initStats(), damPieces: 5 } },
    ];
    const titles = assignTitles(players);
    // otter-1 wins fishEaten (highest, priority 1) since it's the only nonzero fishEaten.
    expect(titles['otter-1']).toBe('title.fish');
    expect(titles['otter-2']).toBe('title.dam');
  });

  it('a stat of 0 is never awarded a title for that stat', () => {
    const players = [
      { id: 'otter-1', stats: { ...initStats(), fishEaten: 0, damPieces: 3 } },
      { id: 'otter-2', stats: initStats() },
    ];
    const titles = assignTitles(players);
    expect(titles['otter-1']).toBe('title.dam');
    expect(titles['otter-2']).not.toBe('title.fish');
  });

  it('7-player extreme case: every player gets exactly one unique title, no duplicates', () => {
    const players = [
      { id: 'otter-1', stats: { ...initStats(), fishEaten: 10 } },
      { id: 'otter-2', stats: { ...initStats(), damPieces: 8 } },
      { id: 'otter-3', stats: { ...initStats(), poopsDug: 6 } },
      { id: 'otter-4', stats: { ...initStats(), mushrooms: 4 } },
      { id: 'otter-5', stats: { ...initStats(), swimTime: 12000 } },
      { id: 'otter-6', stats: initStats() },
      { id: 'otter-7', stats: initStats() },
    ];
    const titles = assignTitles(players);
    const ids = players.map((p) => p.id);
    expect(Object.keys(titles).sort()).toEqual(ids.sort());
    const values = Object.values(titles);
    expect(new Set(values).size).toBe(values.length);
    for (const id of ids) expect(titles[id]).toBeTruthy();
  });

  it('a player with all-zero stats still gets a fallback title, never left unassigned', () => {
    const players = [{ id: 'otter-1', stats: initStats() }];
    const titles = assignTitles(players);
    expect(titles['otter-1']).toBeTruthy();
    expect(typeof titles['otter-1']).toBe('string');
  });

  it('single player with all-zero stats gets a fallback (nobita/eagle pool)', () => {
    const players = [{ id: 'otter-1', stats: initStats() }];
    const titles = assignTitles(players);
    expect(['title.nobita', 'title.eagle']).toContain(titles['otter-1']);
  });

  it('ties broken deterministically (first player in array order wins)', () => {
    const players = [
      { id: 'otter-1', stats: { ...initStats(), fishEaten: 5 } },
      { id: 'otter-2', stats: { ...initStats(), fishEaten: 5 } },
    ];
    const titles = assignTitles(players);
    expect(titles['otter-1']).toBe('title.fish');
    expect(titles['otter-2']).not.toBe('title.fish');
  });

  it('empty players array returns an empty map', () => {
    expect(assignTitles([])).toEqual({});
  });
});
