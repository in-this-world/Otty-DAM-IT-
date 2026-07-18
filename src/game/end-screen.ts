/**
 * P4-2/P4-4: end-of-round overlay row data — PURE module, zero Phaser
 * imports (same pattern as render-map.ts). Resolves each otter's display
 * name (from PlayerProfile.nickname when known) and an idle animation key
 * to draw a small portrait, plus (P4-4) whether that player is the room
 * owner so the end screen can gate a "Restart" control to them.
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
 */
export function buildEndScreenRows(
  otters: Readonly<Record<string, OtterState>>,
  profilesByOtterId: Readonly<Record<string, EndScreenProfile>> = {},
  phase: GamePhase = 'won',
): EndScreenRow[] {
  return Object.values(otters)
    .slice()
    .sort((a, b) => otterIndex(a.id) - otterIndex(b.id))
    .map((otter) => {
      const profile = profilesByOtterId[otter.id];
      const name = profile?.nickname?.trim() ? profile.nickname : fallbackName(otter.id);
      return {
        otterId: otter.id,
        name,
        animKey: otterAnimKey({ action: 'idle', stunnedMs: 0 }, phase),
        owner: profile?.owner ?? false,
      };
    });
}
