/**
 * Content-aware column slicing for OBJECT sheets (P2-08). Object strips are not
 * evenly spaced — props grow/shift across the row — so equal-width grid cuts
 * can slice through a prop and leave the flood-keyed background gap as a seam.
 * Instead we cut at the widest transparent gaps between props.
 *
 * Pure (no sharp): operates on an alpha occupancy profile so it is unit-tested.
 */

/** For each column, true if it holds any pixel more opaque than `alphaMin`. */
export function occupiedColumns(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  alphaMin = 8,
): boolean[] {
  const occ = new Array<boolean>(width).fill(false);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * 4 + 3]! > alphaMin) {
        occ[x] = true;
        break;
      }
    }
  }
  return occ;
}

interface Gap {
  start: number;
  end: number;
}

/**
 * Choose `segments - 1` cut x-positions that separate `segments` objects,
 * placed at the centres of the widest INTERIOR background gaps (runs of empty
 * columns bounded by content on both sides — leading/trailing margins ignored).
 * Falls back to even spacing when there aren't enough interior gaps (e.g. props
 * touching). Returned positions are sorted ascending.
 */
export function chooseCutPoints(occupied: boolean[], segments: number): number[] {
  const width = occupied.length;
  if (segments <= 1) return [];

  const gaps: Gap[] = [];
  let i = 0;
  while (i < width && !occupied[i]) i++; // skip leading margin
  let runStart = -1;
  for (; i < width; i++) {
    if (!occupied[i]) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      gaps.push({ start: runStart, end: i - 1 });
      runStart = -1;
    }
  }
  // a trailing run (runStart >= 0 here) is the right margin -> ignored

  if (gaps.length < segments - 1) {
    const cuts: number[] = [];
    for (let s = 1; s < segments; s++) cuts.push(Math.round((width * s) / segments));
    return cuts;
  }

  const byWidth = [...gaps].sort((a, b) => b.end - b.start - (a.end - a.start));
  const chosen = byWidth
    .slice(0, segments - 1)
    .map((g) => Math.round((g.start + g.end) / 2))
    .sort((a, b) => a - b);
  return chosen;
}
