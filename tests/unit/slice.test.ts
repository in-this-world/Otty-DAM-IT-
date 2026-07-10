/**
 * P2-08 content-aware object slicing: pick cut points at the widest gaps
 * between props so uneven object rows aren't sliced through a prop.
 */
import { describe, expect, it } from 'vitest';
import { chooseCutPoints, occupiedColumns } from '../../scripts/lib/slice';

/** Build a fake RGBA row image: opaque in the given [start,end) column spans. */
function rowImage(width: number, spans: [number, number][], height = 3): Uint8Array {
  const d = new Uint8Array(width * height * 4);
  for (const [a, b] of spans) {
    for (let x = a; x < b; x++) {
      for (let y = 0; y < height; y++) d[(y * width + x) * 4 + 3] = 255;
    }
  }
  return d;
}

describe('occupiedColumns', () => {
  it('flags columns that contain any opaque pixel', () => {
    const occ = occupiedColumns(rowImage(10, [[2, 5]]), 10, 3);
    expect(occ.map((b) => (b ? 1 : 0))).toEqual([0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
  });
});

describe('chooseCutPoints', () => {
  it('returns no cuts for a single segment', () => {
    expect(chooseCutPoints(occupiedColumns(rowImage(10, [[2, 5]]), 10, 3), 1)).toEqual([]);
  });

  it('cuts at gap centres between evenly separated objects', () => {
    // objects at 0-2, 5-7, 10-12 within width 13 -> gaps 2-4 and 7-9
    const occ = occupiedColumns(rowImage(13, [[0, 2], [5, 7], [10, 12]]), 13, 3);
    expect(chooseCutPoints(occ, 3)).toEqual([3, 8]);
  });

  it('prefers the WIDEST gaps (ignores small intra-object gaps)', () => {
    // two real objects separated by a wide gap (10-19), plus a tiny 1px nick
    // inside the first object (3-4) that must NOT be chosen as the cut.
    const occ = occupiedColumns(rowImage(30, [[0, 3], [4, 10], [20, 30]]), 30, 3);
    // for 2 segments we pick the single widest gap -> centre of 10..19 = 14/15
    const cuts = chooseCutPoints(occ, 2);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toBeGreaterThanOrEqual(13);
    expect(cuts[0]).toBeLessThanOrEqual(16);
  });

  it('falls back to even spacing when gaps are missing (props touching)', () => {
    const occ = occupiedColumns(rowImage(12, [[0, 12]]), 12, 3); // solid, no gaps
    expect(chooseCutPoints(occ, 3)).toEqual([4, 8]);
  });
});
