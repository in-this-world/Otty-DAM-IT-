/**
 * P4-2: the end screen shows one portrait per otter with the player's name
 * above it. `buildEndScreenRows` is the pure, Phaser-free row builder GameScene
 * renders; it resolves names (roster nickname → P1/AI fallback) and the win/
 * lose portrait anim, ordered by otter index.
 */
import { describe, expect, it } from 'vitest';
import { buildEndScreenRows } from '../../../src/game/end-screen';
import type { GamePhase, OtterState } from '../../../src/core/types';

type OtterLike = Pick<OtterState, 'id' | 'action' | 'stunnedMs'>;
const otter = (id: string): OtterLike => ({ id, action: 'idle', stunnedMs: 0 });
const otters = (...ids: string[]): Record<string, OtterLike> =>
  Object.fromEntries(ids.map((id) => [id, otter(id)]));

describe('buildEndScreenRows', () => {
  it('orders rows by otter index, not object insertion order', () => {
    const rows = buildEndScreenRows(otters('otter-3', 'otter-1', 'otter-2'), 'won');
    expect(rows.map((r) => r.otterId)).toEqual(['otter-1', 'otter-2', 'otter-3']);
  });

  it('uses roster nicknames when provided', () => {
    const rows = buildEndScreenRows(otters('otter-1', 'otter-2'), 'won', {
      'otter-1': 'Annie',
      'otter-2': 'Otty',
    });
    expect(rows.map((r) => r.name)).toEqual(['Annie', 'Otty']);
  });

  it('falls back to P1 for the local otter and AI N for the rest', () => {
    const rows = buildEndScreenRows(otters('otter-1', 'otter-2', 'otter-3'), 'lost');
    expect(rows.map((r) => r.name)).toEqual(['P1', 'AI 1', 'AI 2']);
  });

  it('treats a blank/whitespace nickname as absent and falls back', () => {
    const rows = buildEndScreenRows(otters('otter-1', 'otter-2'), 'won', {
      'otter-1': '   ',
      'otter-2': 'Otty',
    });
    expect(rows.map((r) => r.name)).toEqual(['P1', 'Otty']);
  });

  it('maps the win portrait on a win and the lose portrait on a loss', () => {
    const won = buildEndScreenRows(otters('otter-1'), 'won');
    const lost = buildEndScreenRows(otters('otter-1'), 'lost');
    expect(won[0]!.animKey).toContain('win');
    expect(lost[0]!.animKey).toContain('lose');
  });

  it('gives every otter exactly one row', () => {
    const ids = ['otter-1', 'otter-2', 'otter-3', 'otter-4'];
    const rows = buildEndScreenRows(otters(...ids), 'won' as GamePhase);
    expect(rows).toHaveLength(ids.length);
    expect(new Set(rows.map((r) => r.otterId)).size).toBe(ids.length);
  });
});
