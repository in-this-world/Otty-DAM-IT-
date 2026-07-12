/**
 * P2-12: free fish swim around inside their water zone.
 *
 * Pure + deterministic: heading comes from a hash of (itemId, tick epoch),
 * not the RNG stream, so replaying the same ticks yields identical motion and
 * the shared rngSeed is untouched. Held fish, fish on land, and fish outside
 * any water rect do not move. Positions stay inside the fish's rect (with a
 * margin) so a swimming fish never beaches itself.
 */
import type { GameEvent, GameState, ItemState, Rect, Vec2 } from './types';

/** Fish drift speed, world units/sec (slow — easy to grab while swimming). */
export const FISH_SWIM_SPEED_PER_SEC = 26;
/** Heading changes every this many ticks (~2.5s at 20Hz). */
export const FISH_HEADING_PERIOD_TICKS = 50;
/** Keep this far inside the water rect edges. */
export const FISH_MARGIN = 14;

/** FNV-1a based hash -> [0,1). Stable across platforms. */
function hash01(id: string, epoch: number): number {
  const s = `${id}:${epoch}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 8) / 0x1000000;
}

function rectContaining(water: readonly Rect[], pos: Vec2): Rect | null {
  for (const r of water) {
    if (pos.x >= r.x && pos.x <= r.x + r.width && pos.y >= r.y && pos.y <= r.y + r.height) {
      return r;
    }
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Per-tick system: drift every free in-water fish along its epoch heading. */
export function fishSwimSystem(state: GameState, dtMs: number, _events: GameEvent[]): GameState {
  const water = state.water;
  if (!water || water.length === 0) return state;
  if (state.phase !== 'playing') return state;

  let items: Record<string, ItemState> | null = null;
  const epoch = Math.floor(state.tick / FISH_HEADING_PERIOD_TICKS);
  const step = (FISH_SWIM_SPEED_PER_SEC * dtMs) / 1000;

  for (const it of Object.values(state.items)) {
    if (it.type !== 'fish' || it.heldBy !== null) continue;
    const rect = rectContaining(water, it.pos);
    if (!rect) continue;
    const angle = hash01(it.id, epoch) * Math.PI * 2;
    const maxY = Math.min(rect.y + rect.height, /* world floor guard */ rect.y + rect.height);
    const pos: Vec2 = {
      x: clamp(it.pos.x + Math.cos(angle) * step, rect.x + FISH_MARGIN, rect.x + rect.width - FISH_MARGIN),
      y: clamp(it.pos.y + Math.sin(angle) * step, rect.y + FISH_MARGIN, maxY - FISH_MARGIN),
    };
    if (pos.x === it.pos.x && pos.y === it.pos.y) continue;
    if (!items) items = { ...state.items };
    items[it.id] = { ...it, pos };
  }

  return items ? { ...state, items } : state;
}
