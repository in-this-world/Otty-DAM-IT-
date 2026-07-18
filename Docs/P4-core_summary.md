# P4-core: P4-1 poke-needs-stick, P4-2 end-screen names, P4-3 no hazards in multiplayer, P4-4 host restart-to-lobby

## What shipped

### P4-1: 沒木棍不能戳 (poke requires a stick in hand)

- `src/core/poke.ts` - `applyPoke(state, otter, events, reject?)` gained a
  `reject: (reason: string) => void` parameter (defaulting to a no-op, same
  convention as `applyUseItem`/`applyThrow`/`applyDig` in `items.ts`). If
  `otter.carrying !== 'branch'`, the function rejects with `'noStick'` and
  returns `state` completely unchanged - no target search, no
  `otterPoked` event, no attacker pose/action change, no side effects at
  all (verified with a full `toEqual` on the pre-poke otter/items state).
- `src/core/tick.ts` - wired `applyPoke`'s reject callback to
  `commandRejected` the same way every other command already does:
  `applyPoke(state, otter, events, (reason) => reject(events, command, reason))`.
- `src/game/scenes/GameScene.ts` - `handleEvents` watches for
  `commandRejected` with `command === 'poke'`, `reason === 'noStick'`, AND
  `playerId === this.localId` (so a networked event stream doesn't pop the
  hint for every otter in the room, only the local player's own rejected
  poke) and calls a new `showToast(t('hint.needStick'))` - a Phaser text
  object with a 900ms hold + 600ms fade-out tween, then destroys itself.

### P4-2: 結局畫面顯示玩家名 (end-screen shows each player's name)

- `src/game/end-screen.ts` (new, pure, zero Phaser imports) -
  `buildEndScreenRows(otters, profilesByOtterId?, phase?)` returns
  `{otterId, name, animKey, owner}[]` sorted by `otter-N` index. Name
  resolution: `profilesByOtterId[otterId].nickname` when present and
  non-blank, else a fallback (`'P1'` for `otter-1`, matching GameScene's
  local single-player `PLAYER_ID`; `'AI N'` for every other otter, numbered
  among the AIs, e.g. otter-2 -> "AI 1", otter-3 -> "AI 2"). `animKey` comes
  from the existing `render-map.ts` `otterAnimKey` (win/lose/idle per
  round phase). `owner` threads P4-4's host flag through the same map.
- `src/game/scenes/GameScene.ts` `renderOverlay` - draws one small portrait
  sprite (idle/win/lose anim, 48px tall) + a name label under it per row,
  laid out in a horizontal strip under the win/lose title. Reads the
  nickname map from the Phaser registry key `netRosterMap` (empty object in
  single-player, so everyone gets the P1/AI-N fallback).

### P4-3: 多人不出現熊與老鷹 (no bear/eagle hazards in multiplayer)

- `src/core/state.ts` - `GameConfig` gained `isMultiplayer?: boolean`. In
  `createInitialState`, when `config.hazards` was requested AND
  `isMultiplayer` is true, the hazard schedule is forced to
  `{ eagle: null, bear: null, schedule: [] }` regardless of what the
  `hazards` config asked for (`enabled` or an explicit `schedule`).
  `isMultiplayer: true` with `hazards` entirely omitted still yields
  `state.hazards === undefined`, byte-identical to single-player's default
  today - this was deliberate so a plain `isMultiplayer` flag never
  *creates* a hazards object where none existed before.
- `src/net/room-sim.ts` - `RoomSimulation.start()` now always passes
  `isMultiplayer: true` into `createInitialState`, so every multiplayer
  round is hazard-free even if `DamRoom`'s config were changed later to
  request hazards.
- `src/core/adapter.ts` (`LocalAdapter`) and `GameScene.ts`'s single-player
  `LocalAdapter` construction were NOT touched - neither ever set
  `isMultiplayer`, so `?hazards=1` single-player rounds are unchanged.

### P4-4: 房主 Restart 回等待室 (host-only restart back to lobby)

- `src/net/protocol.ts` - `ClientMessage.Restart = 'restart'`.
- `src/net/room-sim.ts` - `RoomSimulation.restart(bySessionId): boolean` -
  no-op (`false`) unless `_phase === 'ended'` AND `bySessionId` is the
  current `_ownerId`. On success: `_phase = 'lobby'`, `_state = null`,
  `queue = []`, every roster player's `ready` reset to `false`. NOT a
  re-join: `connections`/`profiles`/`colors`/`joinSeq`/`otterId` all survive
  untouched (only iterates `this.players.values()` to flip `ready`).
- `src/server/DamRoom.ts` - `onMessage(ClientMessage.Restart, (client) => { if (this.sim.restart(client.sessionId)) this.broadcastRoster(); })`.
- `src/game/lobby/LobbyOverlay.ts` - `LobbyResult` gained `onRoster(cb)` and
  `sendRestart()`. Previously, once the round started (`started = true`),
  the `ServerMessage.Roster` handler just returned early and stopped doing
  anything useful. Now it keeps relaying every subsequent roster payload to
  whichever callbacks subscribed via `onRoster` (used by `main.ts` for both
  the nickname/owner map and detecting the phase flip back to `'lobby'`).
  The ready-room DOM itself is still torn down exactly as before
  (`this.close()`); only the message *relay* continues.
- `src/main.ts` - builds `{otterId -> {nickname, owner}}` from every roster
  payload (`rosterToProfiles`) and pushes it into the Phaser registry as
  `netRosterMap`, alongside `netIsOwner` (derived: does the roster entry
  matching my own `localPlayerId` have `owner: true`?) and
  `netSendRestart` (the raw `sendRestart` closure). When a roster payload
  arrives with `phase === 'lobby'` after having previously been
  `playing`/`ended`, the entire `Phaser.Game` is destroyed
  (`game.destroy(true)`) and `boot()` re-runs from scratch - since the
  Colyseus room connection (`result`'s underlying `room`) is untouched by
  this, the 準備室 overlay reappears instantly on the same connected room,
  no re-join round-trip.
- `src/game/scenes/GameScene.ts` - `renderOverlay` shows a host-only
  `t('ui.restart')` button (click or the existing R key) for the owner in
  multiplayer; non-owners get no local restart control at all (no
  misleading "press R" text either, since R does nothing for them - they
  simply see the game get torn down automatically once `main.ts`'s roster
  listener notices the phase flip). Single-player is untouched: the R
  key/click path (`onOverlayActivate`) falls straight through to the
  original `this.restart()` (local `scene.restart()`) exactly as before.

## Key decision: nickname/owner plumbing shared by P4-2 and P4-4

Both slices need the same `{otterId -> {nickname, owner}}` shape, so it's
built exactly once, in `main.ts`'s `rosterToProfiles()`, off the live
`onRoster` feed, and stored under a single registry key (`netRosterMap`)
that both `GameScene.renderOverlay` (P4-2's names) and the restart-button
gate (P4-4's `netIsOwner`, derived from the same map) read from. This
avoids two separate roster-derived data structures drifting out of sync.

## Single-player fallback labels

No `PlayerProfile` exists at all for single-player (`LocalAdapter` never
builds a roster) - documented in `end-screen.ts`'s module doc:
- `otter-1` (the local human player, matches `GameScene.PLAYER_ID`) -> `'P1'`.
- Every other otter (the AI teammates) -> `'AI N'`, numbered among
  themselves starting at 1 (`otter-2` -> "AI 1", `otter-3` -> "AI 2", ...).

This also covers a multiplayer edge case where an otter has no roster
entry (e.g. AI took over after a disconnect and the reconnect window later
expired without the player leaving the session map) - same fallback logic
applies per-otter, independent of the round's actual player count.

## Test results

- Before this branch: 322 tests passing (43 files) on main @ e59d828.
- After: 343 tests passing (44 files).
  - `tests/unit/core/poke.test.ts`: 7 -> 10 tests (+3 P4-1: empty-handed
    rejected, non-branch item rejected, rejected via `reduce()`).
  - `tests/unit/core/tick.test.ts`, `tests/unit/core/hazards.test.ts`,
    `tests/unit/core/adapter.test.ts`: pre-existing tests that poked with an
    empty-handed/non-branch otter were updated to either give the attacker a
    branch first or assert on the new `commandRejected('noStick')` -
    documented inline at each change site.
  - `tests/unit/game/end-screen.test.ts`: new, 6 tests (P4-2 pure helper).
  - `tests/unit/core/state.test.ts`: +4 tests (P4-3 `isMultiplayer` gate,
    including a regression check that `isMultiplayer: false`/omitted is
    byte-identical to today).
  - `tests/unit/net/room-sim.test.ts`: +2 tests (P4-3 hazard gate via
    `start()`) +5 tests (P4-4 `restart()`: no-op in lobby/playing, no-op for
    non-owner, owner succeeds and resets roster readiness, room can
    `start()` fresh again after a restart).
- `npm run check` (`tsc --noEmit && eslint . && vitest run`) is fully green
  on the branch.
- `DamRoom.ts`'s new `Restart` relay and all of `LobbyOverlay.ts`/
  `main.ts`'s registry plumbing remain outside Vitest coverage (both need a
  live server / DOM+Phaser respectively, per this repo's existing
  convention - `DamRoom.ts` and `LobbyOverlay.ts` were already untested
  before this branch). The underlying logic each depends on
  (`RoomSimulation.restart`, `buildEndScreenRows`, the `isMultiplayer`
  hazard gate) is fully unit-tested.
- Live sanity check (Claude-in-Chrome against a running dev server) was not
  performed for this slice - optional per the task brief, not blocking.

## Follow-ups / known gaps

- The end-screen portrait layout is a simple horizontal strip that doesn't
  yet handle very large rosters (10 players) gracefully beyond shrinking
  spacing down to a minimum of ~52px between portraits - fine for the
  current party-game scale, but worth revisiting if the roster cap grows.
- No "waiting for host" copy was added for non-owner multiplayer clients on
  the end screen (deliberately silent - see GameScene.renderOverlay's
  inline comment). If a future pass wants explicit waiting copy, add a new
  i18n key rather than reusing `game.restartHint` (which references the R
  key, misleading for non-owners who have no local restart).
- `RosterEntry.doodleCount` (from the concurrently-merged P4-drawing
  branch) was left untouched throughout - `rosterToProfiles()` and
  `EndScreenProfile` only pull `nickname`/`owner` off each `RosterEntry`,
  ignoring the rest of the shape.
