/**
 * Client-view smoothing for the ColyseusAdapter (P3-02). The server is
 * authoritative at 20 Hz; rendering at 60 fps straight off those snapshots
 * would judder, and the local player would feel a round-trip of input lag.
 * Two pure primitives fix that:
 *
 *   - interpolateSnapshots(a, b, t): render REMOTE otters in the recent past,
 *     lerping between the two snapshots that bracket the render clock. Smooth
 *     motion, no guessing.
 *   - extrapolateOtter(o, world, dtMs): dead-reckon the LOCAL otter forward
 *     from the latest snapshot using its own velocity, so local input feels
 *     instant. Each new snapshot re-bases it, so prediction error self-heals;
 *     a caller may additionally smooth toward the authoritative position.
 *
 * Both mirror movementSystem's integration exactly (same effectiveSpeed, same
 * clamp), so prediction stays in lock-step with the server and reconciliation
 * corrections are tiny. Pure + deterministic => unit-testable without a net.
 */
import { effectiveSpeedPerSec } from '../core/items';
import type { GameState, ItemState, OtterState, Vec2 } from '../core/types';

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const lerpVec2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/**
 * Blend two authoritative snapshots at t in [0,1]. Positions (otters + items)
 * are lerped; every other field is taken from `b` (the newer snapshot), so
 * discrete facts — carrying, action, dam progress, phase — never show a
 * half-state. Otters/items missing from `a` snap to their `b` value.
 */
export function interpolateSnapshots(a: GameState, b: GameState, tRaw: number): GameState {
  const t = clamp01(tRaw);
  if (t <= 0) return a;
  if (t >= 1) return b;

  const otters: Record<string, OtterState> = {};
  for (const [id, ob] of Object.entries(b.otters)) {
    const oa = a.otters[id];
    otters[id] = oa ? { ...ob, pos: lerpVec2(oa.pos, ob.pos, t) } : ob;
  }

  const items: Record<string, ItemState> = {};
  for (const [id, ib] of Object.entries(b.items)) {
    const ia = a.items[id];
    // Held items ride the otter; only lerp free-standing ones between frames.
    items[id] = ia && ib.heldBy === null && ia.heldBy === null
      ? { ...ib, pos: lerpVec2(ia.pos, ib.pos, t) }
      : ib;
  }

  return { ...b, otters, items };
}

/**
 * Dead-reckon a single otter forward by dtMs using its current velocity —
 * the local-prediction primitive. Identical integration to movementSystem:
 * unit direction * effectiveSpeed * dt, clamped to the world. Stationary or
 * stunned otters are returned unchanged (same reference).
 */
export function extrapolateOtter(
  otter: OtterState,
  world: { readonly width: number; readonly height: number },
  dtMs: number,
): OtterState {
  if ((otter.vel.x === 0 && otter.vel.y === 0) || otter.stunnedMs > 0 || dtMs <= 0) {
    return otter;
  }
  const len = Math.hypot(otter.vel.x, otter.vel.y);
  const speed = effectiveSpeedPerSec(otter);
  const dt = dtMs / 1000;
  const x = Math.min(world.width, Math.max(0, otter.pos.x + (otter.vel.x / len) * speed * dt));
  const y = Math.min(world.height, Math.max(0, otter.pos.y + (otter.vel.y / len) * speed * dt));
  if (x === otter.pos.x && y === otter.pos.y) return otter;
  return { ...otter, pos: { x, y } };
}

interface Timed {
  readonly at: number;
  readonly state: GameState;
}

/**
 * A short ring of recent authoritative snapshots, sampled at a render clock
 * that trails real time by `delayMs` (~1.5 server ticks). Returns the
 * interpolated world for that render time. Keeps just enough history to
 * bracket the delayed clock.
 */
export class SnapshotBuffer {
  private readonly buf: Timed[] = [];

  constructor(private readonly delayMs = 80, private readonly maxHistory = 12) {}

  push(state: GameState, at: number): void {
    this.buf.push({ at, state });
    while (this.buf.length > this.maxHistory) this.buf.shift();
  }

  get latest(): GameState | null {
    return this.buf.length > 0 ? this.buf[this.buf.length - 1]!.state : null;
  }

  size(): number {
    return this.buf.length;
  }

  /** Interpolated snapshot for render time `now - delayMs`. */
  sample(now: number): GameState | null {
    if (this.buf.length === 0) return null;
    if (this.buf.length === 1) return this.buf[0]!.state;
    const target = now - this.delayMs;

    // Before our history begins: show the oldest we have.
    if (target <= this.buf[0]!.at) return this.buf[0]!.state;
    // Past the newest: show the newest (extrapolation is the caller's job).
    const last = this.buf[this.buf.length - 1]!;
    if (target >= last.at) return last.state;

    for (let i = 0; i < this.buf.length - 1; i++) {
      const lo = this.buf[i]!;
      const hi = this.buf[i + 1]!;
      if (target >= lo.at && target <= hi.at) {
        const span = hi.at - lo.at;
        const t = span > 0 ? (target - lo.at) / span : 0;
        return interpolateSnapshots(lo.state, hi.state, t);
      }
    }
    return last.state;
  }
}
