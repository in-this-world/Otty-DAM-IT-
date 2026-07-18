/**
 * makeDrawBatch (P4-7): pure batching/flush logic for the shared 準備室
 * drawing canvas. Ground rule from the P3 net lesson baked into this repo:
 * NEVER send one network message per pointer-move event — points must be
 * buffered and flushed periodically. These tests pin that contract down
 * before any DOM/canvas glue exists.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeDrawBatch } from '../../../src/net/draw-batch';

describe('makeDrawBatch', () => {
  it('does not send anything just from adding points', () => {
    const send = vi.fn();
    const batch = makeDrawBatch({ color: '#e6194b', send });
    batch.addPoint(1, 2);
    batch.addPoint(3, 4);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing when ticking short of the flush threshold', () => {
    const send = vi.fn();
    const batch = makeDrawBatch({ color: '#e6194b', send });
    batch.addPoint(1, 2);
    batch.addPoint(3, 4);
    batch.tick(49);
    expect(send).not.toHaveBeenCalled();
  });

  it('flushes exactly one batch with both points in order once past the threshold', () => {
    const send = vi.fn();
    const batch = makeDrawBatch({ color: '#e6194b', send });
    batch.addPoint(1, 2);
    batch.addPoint(3, 4);
    batch.tick(49);
    batch.tick(2); // total 51ms, crosses default 50ms flushMs
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'draw',
      color: '#e6194b',
      pts: [[1, 2], [3, 4]],
    });
  });

  it('integer-snaps points (x|0, y|0)', () => {
    const send = vi.fn();
    const batch = makeDrawBatch({ color: '#3cb44b', send });
    batch.addPoint(1.9, 2.1);
    batch.tick(60);
    expect(send).toHaveBeenCalledWith({
      type: 'draw',
      color: '#3cb44b',
      pts: [[1, 2]],
    });
  });

  it('starts a fresh buffer after a flush', () => {
    const send = vi.fn();
    const batch = makeDrawBatch({ color: '#4363d8', send });
    batch.addPoint(1, 1);
    batch.tick(60); // flush #1: [[1,1]]
    batch.addPoint(9, 9);
    batch.tick(60); // flush #2: [[9,9]]
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, { type: 'draw', color: '#4363d8', pts: [[1, 1]] });
    expect(send).toHaveBeenNthCalledWith(2, { type: 'draw', color: '#4363d8', pts: [[9, 9]] });
  });

  it('never calls send when ticking with an empty buffer', () => {
    const send = vi.fn();
    const batch = makeDrawBatch({ color: '#f58231', send });
    batch.tick(1000);
    batch.tick(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('resets the elapsed timer after a flush (does not immediately re-flush an empty buffer)', () => {
    const send = vi.fn();
    const batch = makeDrawBatch({ color: '#f58231', send });
    batch.addPoint(5, 5);
    batch.tick(50); // flush #1
    batch.tick(50); // no points added since flush #1 -> must not send again
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('respects a custom flushMs', () => {
    const send = vi.fn();
    const batch = makeDrawBatch({ color: '#911eb4', send, flushMs: 200 });
    batch.addPoint(1, 1);
    batch.tick(150);
    expect(send).not.toHaveBeenCalled();
    batch.tick(50); // total 200
    expect(send).toHaveBeenCalledTimes(1);
  });
});
