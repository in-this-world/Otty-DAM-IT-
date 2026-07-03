# P2-03 — 漂浮 + 手牽手水獺筏 + 洗澡去 debuff

## What was done
New pure module `src/core/float.ts` + `tests/unit/core/float.test.ts`, wired
into the default system pipeline. Otters standing in a water Rect start
floating, wash off stun debuffs, and hand-link into rafts that move faster.

### Files changed
- `src/core/float.ts` (new) — `isInWater`, `floatSystem`, `RAFT_LINK_RADIUS`,
  raft grouping (union-find).
- `tests/unit/core/float.test.ts` (new) — 13 tests, all paths.
- `src/core/types.ts` — additive: `Rect` interface; `OtterState.floating?`,
  `OtterState.raftLinks?`; `GameState.water?`; 4 new `GameEvent` members.
- `src/core/items.ts` — `RAFT_SPEED_BONUS_PER_LINK`, `RAFT_SPEED_BONUS_CAP`;
  `effectiveSpeedPerSec` now applies the raft multiplier.
- `src/core/state.ts` — `GameConfig.water?`; sets `water: config.water ?? []`
  and `floating: false, raftLinks: 0` in the otter factory.
- `src/core/tick.ts` — `floatSystem` registered AFTER `movementSystem`.

## New type fields (all OPTIONAL — existing 118 tests keep compiling)
- `interface Rect { x, y, width, height }`
- `OtterState.floating?: boolean`
- `OtterState.raftLinks?: number`  (count of OTHER otters in the same raft)
- `GameState.water?: readonly Rect[]`
- `GameConfig.water?: readonly Rect[]`

## New GameEvent members
- `otterEnteredWater  { playerId }`
- `otterLeftWater     { playerId }`
- `debuffWashedOff    { playerId }`  (emitted only when stunnedMs was > 0)
- `raftFormed         { playerIds }` (one per multi-otter component)

## Tuning constants (owned here)
- `RAFT_LINK_RADIUS = 64` — pairwise distance to link two floating otters.
- `RAFT_SPEED_BONUS_PER_LINK = 0.15` — +15% speed per linked otter.
- `RAFT_SPEED_BONUS_CAP = 1.6` — total raft multiplier capped at 1.6x.
  (These two live in items.ts because effectiveSpeedPerSec is the single
  source of truth for movement speed; re-exported from float.ts.)

## Key decisions
- `floatSystem` runs AFTER `movementSystem` so it reacts to the position the
  otter reached this tick. The raft speed bonus therefore applies from the
  NEXT tick (intended, per task brief).
- Water edges are INCLUSIVE (a point on the boundary counts as in water).
- Rafts = connected components (union-find) of currently-floating otters with
  pairwise distance <= RAFT_LINK_RADIUS. `raftLinks = componentSize - 1`.
- Wash-off clears `stunnedMs` to 0 on land->water transition only; a
  `debuffWashedOff` event fires only if there was actually a stun to clear.
- Action: 'float' is set on entering water only when the otter was idle/walk
  (won't clobber carry/build/eat/poke). On leaving, 'float' -> 'idle'.
- Identity preserved: when there is no water AND nobody is floating, the input
  state reference is returned unchanged.

## Test results
`npm run check` fully green: tsc --noEmit, eslint ., vitest.
131 tests passed (118 pre-existing + 13 new). float.test.ts covers: isInWater
inside/outside/edge/undefined; enter/leave transitions + events; wash-off (and
its absence); raftLinks=1 for a pair (+ effectiveSpeedPerSec boost asserted);
chain of 3 -> raftLinks=2; lone/land otters get no bonus; identity preserved;
and a full reduce() pipeline round-trip proving wiring.

## Follow-ups
- Water zones are not yet placed by the game/level layer — `createInitialState`
  defaults to `water: []`. A level-design pass (P2/P3) should populate them.
- Rendering the 'float' action + raft visuals is a game-layer (Phaser) task.
- raftFormed fires every tick a multi-otter raft exists (not edge-triggered);
  the presentation layer can de-dupe if it wants a one-shot SFX.
