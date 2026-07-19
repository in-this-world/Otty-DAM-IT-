/**
 * P4-2/P4-4/P4-8: end-of-round overlay row data — PURE module, zero Phaser
 * imports (same pattern as render-map.ts). Resolves each otter's display
 * name (from PlayerProfile.nickname when known) and an idle animation key
 * to draw a small portrait, plus (P4-4) whether that player is the room
 * owner so the end screen can gate a "Restart" control to them, plus
 * (P4-8) a resolved title string (assignTitles' output run through t()).
 *
 * Single-player has no PlayerProfile at all (LocalAdapter never builds a
 * roster) — those otters fall back to a generic label: "P1" for the local
 * human player (otter-1, matching GameScene's PLAYER_ID), "AI N" for every
 * other otter (numbered by their otter-N suffix, 1-based among the AIs).
 * This fallback also covers a multiplayer round where, for whatever reason,
 * an otter has no roster entry (e.g. it was AI-covered after a disconnect
 * that expired mid-round — reconnect-window edge case).
 */
import type { GamePhase, OtterState } from '../core/types';
import { otterAnimKey } from './render-map';
import { t } from '../i18n';

/** The minimal per-otter identity info the end screen needs (P4-2 + P4-4). */
export interface EndScreenProfile {
  readonly nickname: string;
  /** P4-4: true if this player owns the room (may host-restart). */
  readonly owner?: boolean;
}

export interface EndScreenRow {
  readonly otterId: string;
  readonly name: string;
  /** Idle animation key to play on the portrait sprite (render-map). */
  readonly animKey: string;
  readonly owner: boolean;
  /**
   * P4-8: resolved title string (t(titleKey, { name })), e.g.
   * "Sea Biscuit - Devourer of All Fish". Undefined when no
   * titlesByOtterId map was passed to buildEndScreenRows (caller opted
   * out, e.g. a screen that doesn't want titles yet).
   */
  readonly title?: string;
}

/** Local single-player's controlled otter id (matches GameScene.PLAYER_ID). */
const LOCAL_SOLO_PLAYER_ID = 'otter-1';

/** `otter-7` -> 7; NaN-safe fallback to a large number so malformed ids sort last. */
function otterIndex(otterId: string): number {
  const m = /^otter-(\d+)$/.exec(otterId);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** Fallback label when no PlayerProfile exists for this otter (single-player,
 *  or a multiplayer edge case with a missing roster entry). */
function fallbackName(otterId: string): string {
  const idx = otterIndex(otterId);
  if (otterId === LOCAL_SOLO_PLAYER_ID) return 'P1';
  // AI otters are numbered among themselves (AI 1 = the first non-local otter).
  const aiNumber = idx > 1 ? idx - 1 : idx;
  return `AI ${aiNumber}`;
}

/**
 * Build one row per otter for the end-screen, in stable otter-N order.
 * `profilesByOtterId` is typically built from the multiplayer roster
 * (RosterEntry.nickname/.owner keyed by otterId); omit/leave sparse for
 * single-player and every otter gets the P1/AI-N fallback.
 *
 * `titlesByOtterId` (P4-8) is typically assignTitles' output (otterId ->
 * title key, e.g. 'title.fish'); when given, each row's `title` is that
 * key resolved through t() with the row's already-computed display name.
 * Omit it (default) to leave `title` undefined — e.g. a caller that
 * doesn't have per-round stats yet.
 */
export function buildEndScreenRows(
  otters: Readonly<Record<string, OtterState>>,
  profilesByOtterId: Readonly<Record<string, EndScreenProfile>> = {},
  phase: GamePhase = 'won',
  titlesByOtterId?: Readonly<Record<string, string>>,
): EndScreenRow[] {
  return Object.values(otters)
    .slice()
    .sort((a, b) => otterIndex(a.id) - otterIndex(b.id))
    .map((otter) => {
      const profile = profilesByOtterId[otter.id];
      const name = profile?.nickname?.trim() ? profile.nickname : fallbackName(otter.id);
      const titleKey = titlesByOtterId?.[otter.id];
      return {
        otterId: otter.id,
        name,
        animKey: otterAnimKey({ action: 'idle', stunnedMs: 0 }, phase),
        owner: profile?.owner ?? false,
        ...(titleKey ? { title: t(titleKey, { name }) } : {}),
      };
    });
}
