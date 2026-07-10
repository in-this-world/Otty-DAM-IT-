# P2-09 — Action clips + impact/splash effects (juice)

**Date:** 2026-07-05 · by Claude (+2 subagents) · branch `feat/wave2-juice`

## What
Event-driven演出 polish on top of the wave-2 wiring:

- **Transient action clips**: on the matching core event an otter briefly plays
  a dedicated clip, then falls back to its base action — itemThrown→throw,
  dugDirt→dig, pickUp(stone)→pick_stone, debuffWashedOff→wash.
- **Impact / splash effects**: short-lived sprites spawn at event locations —
  `obj_star` burst on poke / bear-hit / pit, `obj_splash` on entering water and
  on a successful eagle grab. Each rises + fades over its ttl then self-destroys.

## How / decisions
- Two PURE, unit-tested modules (built by subagents), zero Phaser:
  - `src/game/action-anim.ts` — `transientAnimForEvent(event) -> {otterId, animKey, durationMs} | null`.
  - `src/game/effects.ts` — `effectsForEvent(event, state) -> EffectSpec[]`
    (`{frame, x, y, ttlMs, riseY}`), state used only to resolve otter positions.
- GameScene subscribes to `adapter.onEvents` (adapter already notifies state
  before events, so `this.latest` is current). Transient anim = a per-otter
  `{animKey, expiresAt}` override that beats the base action but sits BELOW
  win/lose/dizzy and only while `phase==='playing' && stunnedMs<=0`. Effects are
  spawned via a tween (alpha→0, y−riseY) and destroyed on complete.
- No core changes; all lookups guarded (`anims.exists`, `hasFrame`). Effects/
  transient anims only fire on live events, so the frozen E2E screenshots
  (boot, no events) are unaffected.

## Verification
- `npm run check` → **224 green** (tsc + eslint + vitest; +6 action-anim, +9 effects units).
- `npm run build` → green.
- Live smoke re-checked after deploy (see STATE wave 15).

## Follow-ups
- Only remaining P2-09 gap is scene/background **tiles** — needs new art (no asset yet).
- Could add throw's fish-arc tween and obj_falling for an ambient sky hazard later.
