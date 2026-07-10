# P2-08 fix — content-aware object slicing (rock seam)

**Date:** 2026-07-05 · by Claude · branch `feat/object-slicing-fix`

## Problem
Object sheets were sliced into equal-width cells (sheet width / height). Props
are unevenly spaced (stones grow and drift across the row), so a cell boundary
cut through a rock; the flood-key then cleared the background gap between the
main rock and the sliver of its neighbour, leaving a transparent vertical
**seam** through obj_stone_1..3 (and any other straddling prop).

## Fix
New `scripts/lib/slice.ts` (pure, tested): `occupiedColumns` + `chooseCutPoints`
cut object strips at the centres of the widest background gaps between props
(falling back to even spacing if props touch). `processObjectSheet` in the
pipeline now: flood-key → gap-cut → tight-crop each prop (sharp `trim`) →
centre at native size on a per-sheet square → resize. Result: no seams, props
centred and proportional, no distortion.

Two sharp gotchas fixed along the way: sharp applies `resize` BEFORE
`extend`/`composite` within one pipeline regardless of chain order, so padding
to the square is done in a separate pass before resizing.

Also bumped in-game `ITEM_DISPLAY_HEIGHT` 30→42 so ground props read better.

## Verify
- `npm run check` → **229 green** (+5 slice unit tests).
- `npm run assets` → 88 frames, atlas ~1.26 MB (< 3 MB budget).
- Visual QA: stones/fish/wood/dam/star/splash/cone/dirt/falling all clean,
  centred, seam-free on a flat backing.

Character/animation sheets are unchanged (still equal-grid — frames there are
evenly spaced and must stay count-aligned).
