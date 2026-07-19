/**
 * P4-2/P4-4/P4-8: pure end-screen row builder — name resolution + fallback,
 * plus (P4-8) attaching a resolved title string per row.
 */
import { describe, expect, it } from 'vitest';
import { buildEndScreenRows } from '../../../src/game/end-screen';
import { createInitialState } from '../../../src/core/state';
import { t } from '../../../src/i18n';

function otters(count: number) {
  return createInitialState({ playerCount: count, seed: 1 }).otters;
}

describe('buildEndScreenRows', () => {
  it('single-player: local otter is P1, teammates are AI 1, AI 2, ...', () => {
    const rows = buildEndScreenRows(otters(3));
    expect(rows.map((r) => r.otterId)).toEqual(['otter-1', 'otter-2', 'otter-3']);
    expect(rows.map((r) => r.name)).toEqual(['P1', 'AI 1', 'AI 2']);
    expect(rows.every((r) => r.owner === false)).toBe(true);
  });

  it('multiplayer: resolves nicknames from the profile map, in otter-N order', () => {
    const rows = buildEndScreenRows(otters(2), {
      'otter-1': { nickname: 'Sea Biscuit', owner: true },
      'otter-2': { nickname: 'Kelp Boy' },
    });
    expect(rows).toEqual([
      { otterId: 'otter-1', name: 'Sea Biscuit', animKey: expect.any(String), owner: true },
      { otterId: 'otter-2', name: 'Kelp Boy', animKey: expect.any(String), owner: false },
    ]);
  });

  it('falls back to P1/AI-N for any otter missing a profile entry (mixed roster)', () => {
    const rows = buildEndScreenRows(otters(3), {
      'otter-2': { nickname: 'Kelp Boy' },
    });
    expect(rows.map((r) => r.name)).toEqual(['P1', 'Kelp Boy', 'AI 2']);
  });

  it('treats a blank/whitespace-only nickname as missing (falls back)', () => {
    const rows = buildEndScreenRows(otters(1), {
      'otter-1': { nickname: '   ' },
    });
    expect(rows[0]!.name).toBe('P1');
  });

  it('uses the win animKey when phase is won, lose when lost', () => {
    const won = buildEndScreenRows(otters(1), {}, 'won');
    const lost = buildEndScreenRows(otters(1), {}, 'lost');
    expect(won[0]!.animKey).toMatch(/win/);
    expect(lost[0]!.animKey).toMatch(/lose/);
  });

  it('empty otters map produces no rows', () => {
    expect(buildEndScreenRows({})).toEqual([]);
  });

  it('attaches a resolved title string per row when a titlesByOtterId map is given', () => {
    const rows = buildEndScreenRows(
      otters(2),
      {
        'otter-1': { nickname: 'Sea Biscuit' },
        'otter-2': { nickname: 'Kelp Boy' },
      },
      'won',
      { 'otter-1': 'title.fish', 'otter-2': 'title.dam' },
    );
    expect(rows[0]!.title).toBe(t('title.fish', { name: 'Sea Biscuit' }));
    expect(rows[1]!.title).toBe(t('title.dam', { name: 'Kelp Boy' }));
  });

  it('omits the title field (undefined) when no titlesByOtterId map is given', () => {
    const rows = buildEndScreenRows(otters(1));
    expect(rows[0]!.title).toBeUndefined();
  });

  it('falls back to an empty title when the otter is missing from titlesByOtterId', () => {
    const rows = buildEndScreenRows(otters(2), {}, 'won', { 'otter-1': 'title.fish' });
    expect(rows[0]!.title).toBe(t('title.fish', { name: 'P1' }));
    expect(rows[1]!.title).toBeUndefined();
  });
});
