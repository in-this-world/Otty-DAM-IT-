# P4-core — P4-1..P4-4 (feat/P4-core)

Branch off `feat/P4-i18n`. `npm run check` green: **338 tests** (317 → 338) +
`vite build` green. All four slices are TDD (red → green) with a clean
core/game split (rules in `src/core`, 演出 in `src/game`, network authority in
`src/net`/`src/server`).

## P4-1 — 沒木棍不能戳 (poke requires a stick)
- `src/core/poke.ts`: `applyPoke` gained a `reject` callback (same shape as the
  other handlers) and now returns **immediately, state untouched**, when the
  attacker isn't `carrying === 'branch'` — no target search, no pose change, no
  hazard repel, no events. `src/core/tick.ts` wires the reject to
  `commandRejected` like every other command.
- `src/game/scenes/GameScene.ts`: on a local `commandRejected {command:'poke',
  reason:'noStick'}` it shows a `showToast(t('hint.needStick'))` (900 ms hold +
  600 ms fade). Gated on `playerId === localId` so a networked event stream only
  toasts your own whiff.
- Design note: the stick requirement also gates poke-driven hazard repel (P2-13),
  matching the plan's top-of-function guard — you need a stick to shoo an
  eagle/bear too. Updated the P2-13 repel test to hold a branch.
- Tests: 3 new in `poke.test.ts` (reject + no-op, lands with stick, reduce-level
  `noStick`); updated the poke helper to arm the attacker; fixed two pre-P4 tests
  that poked empty-handed (`tick.test.ts` now hands the otter a branch;
  `adapter.test.ts` drain test switched to a stick-independent `move`).

## P4-2 — 結局顯示玩家名 (end-screen player names)
- New pure `src/game/end-screen.ts` (zero Phaser): `buildEndScreenRows(otters,
  phase, namesByOtterId?)` → `{otterId, name, animKey}[]` ordered by otter index.
  Name = roster nickname if present/non-blank, else `P1` for otter-1 and `AI N`
  for the rest (single-player). `animKey` from the existing `otterAnimKey`
  (win/lose portrait).
- `GameScene.renderOverlay` now draws a centered strip of name-labelled
  win/lose portraits under the title (reads an optional `netRosterNames`
  registry map; empty in single-player → P1/AI fallbacks). Overlay box enlarged
  to fit.
- Tests: `end-screen.test.ts` (6) — ordering, nickname use, P1/AI fallback,
  blank-nickname fallback, win/lose portrait, one-row-per-otter.

## P4-3 — 多人不出現熊與老鷹 (no bear/eagle in multiplayer)
- `src/core/hazards.ts`: `HAZARD_MP_ALLOWED = { eagle:false, bear:false }` +
  pure `filterHazardsForMode(spawns, {multiplayer})`.
- `src/core/state.ts`: `GameConfig.multiplayer?: boolean`; the hazard schedule is
  passed through `filterHazardsForMode` before sorting, so a multiplayer round
  spawns nothing even with an explicit bear/eagle schedule. Single-player
  (default `false`) is unchanged.
- `src/net/room-sim.ts`: `RoomSimulation.start` passes `multiplayer: true`.
- Tests: `hazards-mp.test.ts` (5) — filter both modes, allow-map, and
  `createInitialState` suppression vs single-player retention.

## P4-4 — 房主 Restart 回等待室 (host restart to lobby)
- `src/net/room-sim.ts`: `restart(bySessionId?)` — owner-gated, valid only once a
  round has begun (playing/ended). Discards `_state` (so otter size/loot/map
  objects reset for free on the next round), un-readies everyone, drops
  disconnected stragglers, **promotes mid-game spectators to players**, keeps
  connections/profiles/ownership, and hands off the crown if the owner is gone.
  The dam requirement rebuilds from the fresh roster on the next `start()`.
- `src/net/protocol.ts`: `ClientMessage.Restart = 'restart'`.
- `src/server/DamRoom.ts`: handles `Restart` (owner-gated via
  `sim.restart(sessionId)`), stops the tick loop, re-broadcasts the lobby roster.
  Added `stopLoop()` (loop callback now early-returns when paused).
- `src/net/transport.ts`: `LoopbackTransport` relays `Restart` so the in-process
  multiplayer path is whole.
- Host transfer on owner-leave was already handled by `handoffOwner`; added a
  test to lock it in.
- Tests: 7 new in `room-sim.test.ts` — non-owner ignored, owner→lobby + state
  cleared, un-ready + keep connection/profile, spectator promotion, fresh round
  (dam progress 0), can't-restart-from-lobby, crown handoff.

## Follow-up (deferred to the next slice / review)
- **P4-4 networked client 演出**: a host-only Restart button on the end screen
  that sends `ClientMessage.Restart`, and the client returning to the 準備室 when
  a `phase:'lobby'` roster arrives mid-game. The server authority + protocol are
  done and tested; the remaining piece is UI reflow (making `main.ts`'s
  lobby→game handoff re-entrant) + a two-browser E2E, best paired with the
  endgame slice. Single-player R-restart is unchanged.
- `netRosterNames` registry map isn't populated by the lobby yet — P4-2 renders
  P1/AI fallbacks until the net path sets it (trivial follow-up).
