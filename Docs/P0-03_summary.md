# P0-03 Summary — Asset Pipeline (`npm run assets`)

## Approach

`scripts/prepare-assets.ts` is a thin entry point over testable modules in `scripts/lib/`:

| Module | Responsibility |
| --- | --- |
| `grid.ts` | `detectGrid(w, h)` — frames are square, so frame count = width / height (2508x627 -> 4x627, 2172x724 -> 3x724). Throws on non-integer grids. |
| `colorkey.ts` | `sampleBackgroundColor` averages a 4x4 patch in each corner; `applyColorKey` computes Euclidean RGB distance to that color per pixel: dist <= tolerance (26) -> alpha 0, linear ramp over a feather band (34) -> soft edges, else alpha 255. Pure function, does not mutate input. |
| `atlas.ts` | `packFrames` — deterministic shelf packer (maxWidth 1024, 2 px padding against texture bleed); `buildPhaserAtlasJson` — Phaser 3 hash-format atlas JSON (`this.load.atlas` compatible). |
| `animations.ts` | `buildAnimationsManifest` — frame names `${key}_${i}`, frameRate 8; repeat -1 for idle/walk/carry/float/build (loops), repeat 0 for poke/eat (one-shot). |
| `pipeline.ts` | `processSheet` (load -> ensureAlpha -> color-key -> slice -> lanczos3 resize to 128x128) and `runPipeline` (find A..G sheets by letter prefix, process, pack, composite atlas with sharp, write outputs). |

Sheet mapping: A->idle, B->walk, C->carry, D->poke, E->eat, F->float, G->build.
`Character_1.png` / `Character_2_Action.png` are portraits and deliberately skipped.

Dependencies added: `sharp`, `@types/node` (dev). `tsconfig.json` types now
includes `"node"`.

## Output (`public/assets/`)

| File | Size | Notes |
| --- | --- | --- |
| `otter.png` | 346 KB | 908x518 RGBA atlas, 25 frames of 128x128, alpha verified |
| `otter.json` | 8.4 KB | Phaser 3 hash atlas (25 frame entries) |
| `animations.json` | 1.2 KB | 7 animations, frameRate 8, repeat flags |

Total ~355 KB — comfortably inside the <3 MB first-load budget.

## Test coverage (`tests/unit/`)

- `asset-pipeline.test.ts` (12 tests) — pure-function coverage using synthetic RGB
  images generated with sharp at test time (no dependency on real `Assets/`):
  grid detection (incl. error cases), corner background sampling, color-key
  (corners transparent, subject opaque, RGB preserved, input not mutated),
  shelf packing (bounds, pairwise no-overlap, maxWidth), Phaser atlas JSON
  entries matching the layout, animations manifest keys/frames/repeat, and
  `processSheet` end-to-end on a synthetic 3-frame strip (frame count/size,
  RGBA length, alpha at corners/center).
- `asset-pipeline.integration.test.ts` (1 test) — runs `runPipeline` on the real
  `Assets/` sheets into a temp dir; auto-skipped via `describe.skipIf` when
  `Assets/` is absent (CI-safe if art is not committed). Asserts 4-channel
  atlas with alpha, 25 atlas frames, all 7 animation keys, and that every
  manifest frame exists in the atlas.

All 13 pass locally. Feathered-pixel count on the real atlas: ~36k
semi-transparent pixels, confirming edge feathering is active.

## Known limitations

- **Color fringing**: feathered edge pixels keep their original
  (light-gray-blended) RGB; no color decontamination / matte subtraction is
  done. Not visible at 128 px on light scenes; could show on dark backgrounds.
- **Interior background holes**: color-key is global, so background-colored
  pixels *inside* the character would also turn transparent. Not observed on
  the current art.
- **Fixed tolerance** (26, feather 34) rather than derived from bg noise
  statistics; tuned for the current near-solid ~rgb(237,237,237) background.
- Shelf packer is not optimal for heterogeneous frame sizes (fine for 25
  uniform squares).
- Frames are not trimmed (`trimmed: false`), so transparent margins cost atlas
  space; irrelevant at 355 KB.
