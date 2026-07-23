/**
 * P4-2: pure end-screen row builder (zero Phaser — CLAUDE.md rule 2 keeps演出
 * data derivable and unit-testable). One row per otter: the name to show above
 * its portrait plus the win/lose portrait anim key. GameScene draws a strip of
 * these under the win/lose title.
 *
 * Name resolution: a roster nickname (multiplayer) wins; otherwise the local
 * otter shows "P1" and the rest show "AI 1", "AI 2"… (single-player).
 */
import type { GamePhase, OtterState } from '../core/types';
import { otterAnimKey } from './render-map';

export interface EndScreenRow {
  readonly otterId: string;
  readonly name: string;
  readonly animKey: string;
}

type OtterLike = Pick<OtterState, 'id' | 'action' | 'stunnedMs'>;

const otterIndex = (id: string): number => {
  const n = Number(id.replace('otter-', ''));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

export function buildEndScreenRows(
  otters: Record<string, OtterLike>,
  phase: GamePhase,
  namesByOtterId: Record<string, string> = {},
): EndScreenRow[] {
  const ordered = Object.values(otters).sort((a, b) => otterIndex(a.id) - otterIndex(b.id));
  let aiSeq = 0;
  return ordered.map((o) => {
    const provided = namesByOtterId[o.id]?.trim();
    const name = provided ? provided : o.id === 'otter-1' ? 'P1' : `AI ${++aiSeq}`;
    return { otterId: o.id, name, animKey: otterAnimKey(o, phase) };
  });
}
