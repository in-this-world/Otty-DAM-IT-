/**
 * P2-12: free fish swim around inside their water zone.
 *
 * Pure + deterministic: heading comes from a hash of (itemId, tick epoch),
 * not the RNG stream, so replaying the same ticks yields identical motion and
 * the shared rngSeed is untouched. Held fish, fish on land, and fish outside
 * any water rect do not move.
 *
 * Boss playtest fixes (2026-07-12):
 *  - wall-aware steering: near an edge the heading is bent back inside, so a
 *    fish can never pin itself into a corner until the epoch rolls over;
 *  - rest beats: some epochs a fish just hovers (swim "once in a while");
 *  - art-aware bounds: the bank tiles paint grass on the top strip and on the
 *    right half of the river's edge column, so the swimmable box is inset
 *    from the gameplay rect (fish never render on the grass).
 */
import type { GameEvent, GameState, ItemState, Rect, Vec2 } from './types';

/** Fish drift speed, world units/sec (slow — easy to grab while swimming). */
export const FISH_SWIM_SPEED_PER_SEC = 26;
/** Heading changes every this many ticks (~2.5s at 20Hz). */
export const FISH_HEADING_PERIOD_TICKS = 50;
/** Keep this far inside the water rect's left/bottom edges. */
export const FISH_MARGIN = 14;
/** Bank art paints grass on the top strip of the water rect. */
export const FISH_TOP_INSET = 58;
/** ...and on the right half of the river's edge column (flipped v-bank). */
export const FISH_RIGHT_INSET = 62;
/** Within this distance of a wall the heading is bent back inside. */
export const FISH_WALL_AVOID = 26;
/** Fraction of epochs a fish rests instead of swimming. */
export const FISH_REST_CHANCE = 0.35;

/**
 * FNV-1a + murmur3 finalizer -> [0,1). Stable across platforms. The fmix32
 * avalanche step is REQUIRED: plain FNV's upper bits barely change when only
 * the trailing epoch digit differs, which froze fish on near-constant draws
 * (boss playtest: "fish get stuck / stop moving").
 */
function hash01(id: string, epoch: number): number {
  const s = `${id}:${epoch}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // murmur3 fmix32
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 8) / 0x1000000;
}

/** The visually-swimmable box inside a water rect (see art notes above). */
export function fishBounds(rect: Rect): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: rect.x + FISH_MARGIN,
    maxX: rect.x + rect.width - FISH_RIGHT_INSET,
    minY: rect.y + FISH_TOP_INSET,
    maxY: rect.y + rect.height - FISH_MARGIN,
  };
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
export function fishSwimSystem(state: GameState, dtMs: number, events: GameEvent[]): GameState {
  void events; // System signature; fish drift emits no events.
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
    const b = fishBounds(rect);

    // Rest beat: this epoch the fish just hovers in place.
    if (hash01(`${it.id}~rest`, epoch) < FISH_REST_CHANCE) continue;

    const angle = hash01(it.id, epoch) * Math.PI * 2;
    let vx = Math.cos(angle);
    let vy = Math.sin(angle);
    // Wall-aware steering: bend the heading back inside near an edge so the
    // fish never grinds into a corner waiting for the next epoch.
    if (it.pos.x - b.minX < FISH_WALL_AVOID) vx = Math.abs(vx);
    else if (b.maxX - it.pos.x < FISH_WALL_AVOID) vx = -Math.abs(vx);
    if (it.pos.y - b.minY < FISH_WALL_AVOID) vy = Math.abs(vy);
    else if (b.maxY - it.pos.y < FISH_WALL_AVOID) vy = -Math.abs(vy);

    const pos: Vec2 = {
      x: clamp(it.pos.x + vx * step, b.minX, b.maxX),
      y: clamp(it.pos.y + vy * step, b.minY, b.maxY),
    };
    if (pos.x === it.pos.x && pos.y === it.pos.y) continue;
    if (!items) items = { ...state.items };
    items[it.id] = { ...it, pos };
  }

  return items ? { ...state, items } : state;
}
