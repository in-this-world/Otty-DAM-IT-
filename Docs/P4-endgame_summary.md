# P4-endgame summary — P4-8 (統計、稱號與結算畫面)

Branch: `feat/P4-endgame`, off `c9d8857` (i18n + P4-core + P4-loot +
P4-drawing already merged). 357 -> 383 tests. `npm run check`
(tsc --noEmit && eslint . && vitest run) green.

## Scope

Per-player stats tally + title assignment + end-screen wiring — the last
slice of Phase 4. Extends `src/game/end-screen.ts` (P4-2's pure row
builder), does not replace it.

## New module: `src/core/stats.ts`

Pure, zero-Phaser (matches `core/tick.ts` systems pattern).

- `PlayerStats`: `fishEaten`, `damPieces`, `poopsDug`, `mushrooms`,
  `swimTime`, `diamonds`, `doodles`.
- `initStats()`: all-zero record.
- `tallyEvent(stats, event)`: pure reducer over one `GameEvent`. Handles
  `itemEaten` (fish -> fishEaten++, mushroom -> mushrooms++ — mushrooms
  EATEN, not dug), `damProgressed` (damPieces++ per occurrence, not by
  `amount`), `lootRolled` (poop -> poopsDug++, diamond -> diamonds++; other
  outcomes no-op since mushroom is counted on eat and vest/hat/nothing
  aren't tracked stats). Events for an otter not already present in the
  stats map are ignored (no-op) rather than auto-seeding — callers seed the
  map on round start.

### Design decision (a): event-driven tally vs state mutation

Chosen: event-driven (`tallyEvent` over `GameEvent[]`), not derived by
diffing `GameState` between ticks. Every stat here corresponds to a
discrete occurrence that already has a dedicated `GameEvent` (`itemEaten`,
`damProgressed`, `lootRolled`), so tallying off the event stream is a
direct 1:1 mapping with no risk of double-counting or missing a same-tick
double-occurrence (e.g. two `damProgressed` events landing in one tick both
increment `damPieces`, which state-diffing on `dam.progress` couldn't
distinguish from a single big contribution).

### Design decision (b): swim-time accumulation method

Chosen, per the brief's own steer: **not** entry/exit event pairing.
`otterEnteredWater`/`otterLeftWater` carry no duration and pairing them
would need extra per-otter bookkeeping that's fragile across
disconnect/reconnect and AI takeover. Instead `accumulateSwimTime(stats,
state, dtMs)` runs once per tick and adds `dtMs` to every otter currently
`floating === true`, read directly off `GameState.otters`. Self-correcting
(no state to get out of sync), and trivially matches whatever the reducer
already computed for `floating` that tick.

## `assignTitles(players)`

Priority pass over `[fishEaten, damPieces, poopsDug, mushrooms, swimTime]`
in that order: for each stat, pick the highest-value player among those not
yet assigned a title, only if `> 0`. Ties break by array order (first
player in the input array wins — deterministic, no RNG). Any player still
unassigned after the pass gets a fallback title.

### Title fallback pool logic

`FALLBACK_POOL = ['title.nobita', 'title.eagle', ...the 5 stat title keys]`.
Unassigned players are walked in array order; each is given
`FALLBACK_POOL[i % pool.length]`, advancing `i` and skipping any pool entry
already claimed by an earlier player this game (so no two players ever
share a title even once the 2-entry pool proper is exhausted — verified by
the 7-player test, where 5 players win stat titles and 2 zero-stat players
land on `title.nobita`/`title.eagle` without collision).

Verified against the brief's exact test cases:
- `fishEaten: 9` -> `title.fish`, `damPieces: 5` -> `title.dam` (2-player
  case).
- 7-player extreme case: every player gets exactly one unique title, no
  duplicates (`tests/unit/core/stats.test.ts`).
- All-zero-stats player still gets a fallback, never left unassigned.

## Locale entries (`src/locale/en.ts` + `src/locale/zh-TW.ts`)

Added `title.fish`, `title.dam`, `title.poop`, `title.mush`, `title.swim`,
`title.nobita`, `title.eagle` — all `{name}`-interpolated via the existing
`t()` mechanism, exact copy from the brief, in both dictionaries.

## `src/game/end-screen.ts` extension

`EndScreenRow` gains an optional `title?: string`. `buildEndScreenRows` now
takes an optional 4th param `titlesByOtterId?: Record<string, string>`
(assignTitles' output); when given, each row's `title` is
`t(titleKey, { name })` using that row's already-resolved display name
(so a title reads "Sea Biscuit - Devourer of All Fish", not the raw otter
id). Omitted -> `title` stays `undefined` (backward compatible with
existing callers/tests).

## Wiring stats into the game loop

Both `RoomSimulation` (multiplayer/server) and `LocalAdapter`
(single-player) already run `reduce()` once per tick and get back
`{ state, events }` — the natural hook point per the brief.

- `RoomSimulation`: new private `_stats: Record<string, PlayerStats>`,
  seeded fresh (one `initStats()` per otter) in `start()`, cleared in
  `restart()`. `step()` folds `tallyEvent` over the tick's events then
  `accumulateSwimTime` over the new state, in that order. Exposed via a new
  `stats(): Readonly<Record<string, PlayerStats>>` method (mirrors the
  existing `doodleCount(sessionId)` accessor pattern).
- `LocalAdapter`: same shape — private `stats` field seeded in the
  constructor from the initial otters, updated the same way inside the
  existing private `step()`, exposed via a new `getStats()` method.
- `GameAdapter` interface itself is **unchanged** — `getStats()` lives only
  on `LocalAdapter`, not the shared contract, so the P3-02 conformance test
  (`adapter.conformance.test.ts`, which asserts `LocalAdapter` and
  `ColyseusAdapter` behave identically against `GameAdapter`) needed no
  changes. Networked stats are relayed a different way (see below), not by
  extending the polymorphic interface.

## Doodle-count + network relay

`RoomSimulation.stats()` only has per-otter gameplay stats; `doodleCount`
is tracked per-*session* (P4-7), so it can't be folded into `_stats`
directly without assuming a stable session<->otter mapping across
reconnects. Instead:

- `protocol.ts`: `RosterEntry` gains an optional `stats?: PlayerStats`
  field (parallel to the existing `doodleCount: number`).
- `DamRoom.rosterPayload()`: stamps `stats: p.otterId ? this.sim.stats()[p.otterId] : undefined`
  per roster entry, alongside the existing `doodleCount`.
- `main.ts`: new `rosterToStats(payload)` builds `{otterId -> PlayerStats}`,
  merging in `doodleCount` as the `doodles` field (`{ ...p.stats, doodles:
  p.doodleCount }`). Stored in the Phaser registry as `netStatsMap`,
  refreshed on every roster broadcast exactly like the existing
  `netRosterMap` (nickname/owner) — same pattern, same lifecycle.
- `GameScene.computeTitles(state)`: reads `netStatsMap` from the registry
  if present (multiplayer), else falls back to `(this.adapter as
  LocalAdapter).getStats()` (single-player) via a narrow structural type
  check (`typeof localAdapter.getStats === 'function'`) rather than an
  `instanceof` check, so it works uniformly whether or not the injected
  adapter happens to be a real `LocalAdapter` instance. Missing/absent
  stats for any otter fall back to `initStats()` so `assignTitles` never
  sees a hole.
- `renderOverlay`: calls `computeTitles(state)` and passes the result as
  `buildEndScreenRows`'s 4th arg; each row's `title` (if present) is drawn
  as a small (`9px`) wrapped text line under the name, in `#ffe08a`. The
  overlay box grows by 22px when any row has a title, and the
  restart/hint text shifts down to match — plain `add.text`/`add.sprite`
  calls, following the file's existing style (no new abstraction).

## Known gaps

- Doodle count is unavailable in single-player by design/spec (no roster
  exists there) — `PlayerStats.doodles` stays `0` for every otter in
  `LocalAdapter`'s tally. Expected, not a bug.
- `RosterEntry.stats` is `undefined` until the round actually starts (no
  `GameState` exists in the lobby phase); `rosterToStats` skips those
  entries, and `computeTitles` backfills with `initStats()` so the end
  screen never crashes on a stats-less otter (e.g. a spectator promoted
  very late, or a roster snapshot race right at round end).
- The visual overlay change (title text under each name) is not covered by
  a Phaser-level test — `end-screen.test.ts` covers the pure row-builder
  output (`row.title` string correctness), which is the part with real
  logic; the Phaser rendering is a thin, mechanical draw call in the same
  style as the surrounding code.

## Test results

- Before this branch: 357 tests (confirmed via `npm run check` at
  `c9d8857` before starting).
- After: 383 tests (357 + 23 in `tests/unit/core/stats.test.ts` + 3 new
  cases in `tests/unit/game/end-screen.test.ts`).
- `npm run check` (tsc --noEmit && eslint . && vitest run): green.
