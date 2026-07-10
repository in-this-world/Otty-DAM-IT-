# P2-08/P2-09 — Wire wave-2 art into GameScene

**Date:** 2026-07-05 · by Claude · branch `feat/wave2-wiring`

## What
Replaced GameScene placeholder graphics with the wave-2 atlas art.

- **Items** now render as `obj_*` sprites (branch→obj_wood, fish→obj_fish,
  stone→obj_stone, cone→obj_cone, dirt→obj_dirt) instead of brown dots.
- **Dam** renders as a staged `obj_dam` sprite that advances 0→3 with build
  progress and swaps to the decorated frame (`obj_dam_5`) on a win; the HUD
  progress bar is unchanged.
- **NPCs** (eagle/bear) render as real animated sprites, scaled bear >> otter >>
  eagle; the eagle keeps a ground shadow as its swoop telegraph, the bear flips
  to face its lure/target.
- **Cone hat** draws a small `obj_cone` above the head while an otter wears it.
- **Otter clips**: dizzy plays while `stunnedMs > 0`; win/lose play on the
  round-end phase — via the pure `otterAnimKey` map.

## How / decisions
- New PURE module `src/game/render-map.ts` (zero Phaser) is the single source of
  truth for state→frame/anim mapping: `itemFrame`, `damStageFrame`,
  `otterAnimKey`, `NPC` sizes, cone/dam constants. Keeps rules-vs-演出 split
  intact and lets everything be unit-tested.
- No core changes: dizzy/win/lose are chosen in the game layer from existing
  state (`stunnedMs`, `phase`), so `OtterAction` and the reducer are untouched.
- All frame/anim lookups are guarded (`textures.get().has()`, `anims.exists()`)
  so a missing sheet degrades gracefully instead of crashing.
- Frames are uniform 128px; NPC size contrast is applied as a render scale
  (`NPC.bear.displayHeight` 150 vs `NPC.eagle` 84 vs otter 96).

## Verification
- `npm run check` → **209 green** (tsc + eslint + vitest; +6 render-map units incl.
  a contract test asserting every frame/anim the map emits exists in
  `public/assets/{otter,objects,animations}.json`).
- `npm run build` → green.
- **E2E note:** the two frozen-scene screenshots (`boot-screen`, `mobile-boot`,
  both `hazards=0`) change because items + dam now use sprites. Per `.github/
  workflows/ci.yml`, the e2e job auto-regenerates + commits linux baselines on
  `main` when they mismatch (`[skip ci]`). So the first post-merge e2e run is
  expected red once, then the refreshed baseline lands and subsequent runs are
  green. Playwright's chromium can't be fetched in the sandbox, so baselines
  were not regenerated locally.

## Follow-ups
- Tune sprite sizes/offsets and dam placement against the live build.
- Optional: distinct clips for throw/dig/pick_stone/wash during those actions
  (currently they fall back to the action's base clip); obj_star/obj_splash/
  obj_falling effects for pokes/impacts/eagle drops; scene/background tiles (the
  remaining P2-09 gap).
