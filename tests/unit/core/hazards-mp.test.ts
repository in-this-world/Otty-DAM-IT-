/**
 * P4-3: no bear/eagle in multiplayer. Both hazards single out one otter (the
 * eagle carries you off, the bear chases and swats), which feels unfair in a
 * co-op party race — so multiplayer rounds spawn neither. Single-player is
 * unchanged.
 */
import { describe, expect, it } from 'vitest';
import { filterHazardsForMode, HAZARD_MP_ALLOWED } from '../../../src/core/hazards';
import { createInitialState } from '../../../src/core/state';
import type { HazardSpawn } from '../../../src/core/types';

const spawns: HazardSpawn[] = [
  { kind: 'eagle', atTimerMs: 5000 },
  { kind: 'bear', atTimerMs: 3000 },
];

describe('filterHazardsForMode', () => {
  it('drops every current hazard kind in multiplayer', () => {
    expect(filterHazardsForMode(spawns, { multiplayer: true })).toEqual([]);
  });

  it('keeps the full schedule in single-player', () => {
    expect(filterHazardsForMode(spawns, { multiplayer: false })).toEqual(spawns);
  });

  it('marks bear and eagle as not multiplayer-allowed', () => {
    expect(HAZARD_MP_ALLOWED.bear).toBe(false);
    expect(HAZARD_MP_ALLOWED.eagle).toBe(false);
  });
});

describe('createInitialState multiplayer hazard suppression', () => {
  const schedule = [
    { kind: 'eagle' as const, atElapsedMs: 1000 },
    { kind: 'bear' as const, atElapsedMs: 2000 },
  ];

  it('multiplayer round schedules no hazards even with an explicit bear/eagle schedule', () => {
    const s = createInitialState({
      playerCount: 4,
      seed: 1,
      multiplayer: true,
      hazards: { schedule },
    });
    expect(s.hazards?.schedule ?? []).toEqual([]);
  });

  it('single-player round keeps the scheduled hazards', () => {
    const s = createInitialState({
      playerCount: 1,
      seed: 1,
      hazards: { schedule },
    });
    expect((s.hazards?.schedule ?? []).map((x) => x.kind).sort()).toEqual(['bear', 'eagle']);
  });
});
