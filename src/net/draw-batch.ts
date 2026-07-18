/**
 * makeDrawBatch (P4-7): pure batching/flush logic for the shared 準備室
 * drawing canvas. Repo lesson from P3 multiplayer work: NEVER send one
 * network message per pointer-move event — buffer points and flush on an
 * interval instead. This module owns that buffering; it knows nothing about
 * DOM/canvas/Colyseus, so it's fully unit-testable (see
 * tests/unit/net/draw-batch.test.ts).
 *
 * Usage: call `addPoint` on every pointermove; drive `tick(dtMs)` off a
 * setInterval/rAF accumulator. Once `flushMs` has elapsed AND the buffer is
 * non-empty, `tick` calls `send(...)` exactly once with the buffered points
 * (in order) and clears the buffer + resets the elapsed timer. An empty
 * buffer at the threshold sends nothing (no empty network messages).
 */
export interface DrawBatch {
  addPoint(x: number, y: number): void;
  /** Call each frame/interval; flushes if flushMs elapsed since last flush. */
  tick(dtMs: number): void;
}

export interface DrawBatchOptions {
  readonly color: string;
  /** Flush interval in ms. Defaults to 50 (repo's batching convention). */
  readonly flushMs?: number;
  readonly send: (payload: {
    type: 'draw';
    color: string;
    pts: readonly (readonly [number, number])[];
  }) => void;
}

const DEFAULT_FLUSH_MS = 50;

export function makeDrawBatch(opts: DrawBatchOptions): DrawBatch {
  const flushMs = opts.flushMs ?? DEFAULT_FLUSH_MS;
  let buffer: Array<readonly [number, number]> = [];
  let elapsedMs = 0;

  return {
    addPoint(x: number, y: number): void {
      buffer.push([x | 0, y | 0]);
    },
    tick(dtMs: number): void {
      elapsedMs += dtMs;
      if (elapsedMs < flushMs) return;
      elapsedMs = 0;
      if (buffer.length === 0) return;
      const pts = buffer;
      buffer = [];
      opts.send({ type: 'draw', color: opts.color, pts });
    },
  };
}
