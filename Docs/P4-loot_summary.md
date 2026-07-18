# P4-loot summary — P4-5 (mushroom) + P4-6 (dig loot table)

Branch: `feat/P4-loot`, off `e59d828` (i18n + P4-7 drawing already merged).
322 -> 336 tests. `npm run check` (tsc --noEmit && eslint . && vitest run) green.

## P4-5: mushroom (eat to scale up, stacks to 4)

- `src/core/types.ts`: `ItemType` += `'mushroom'` (additive union member).
  `OtterState` += `mushroomStacks?: number` (0..4) and `scale?: number`
  (additive, optional — matches the `invulnMs?`/`raftLinks?` style).
- `src/core/items.ts`: `MUSHROOM_SCALE = 1.5`, `MAX_MUSHROOM_STACKS = 4`.
  `applyUseItem`'s `case 'mushroom'`: consumes the held mushroom, sets
  `action: 'eat'` (reuses `TRANSIENT_ACTION_HOLD_MS` like fish), increments
  `mushroomStacks` capped at `MAX_MUSHROOM_STACKS`, and sets
  `scale = MUSHROOM_SCALE ** stacks`. A 5th+ mushroom still emits the
  existing `itemEaten` event (itemType: 'mushroom') but `scale`/`stacks`
  stop changing once the cap is hit — verified by test.
- No new event type: reused `itemEaten` per the task brief (it already
  carries `itemType`).

### Scale/hitbox representation decision

No hitbox/scale concept existed anywhere in `src/` before this slice (grepped
`hitbox`/`scale` across `src/core` and `src/game` — zero hits). This slice
introduces `OtterState.scale?: number` as **state only**; it is not wired
into Phaser rendering or collision in GameScene. Game-layer code that wants
to visually grow the otter sprite and/or widen its hitbox should read
`otter.scale` (default 1 when undefined) and multiply the sprite's
`setScale()` and any collision-radius calculation by it. That wiring is
explicitly out of scope here per the task brief ("don't feel obligated to
wire full Phaser-side rendering/collision scaling in this slice").

## P4-6: dig loot table

- `src/core/items.ts`:
  - `LOOT_TABLE` (weights sum to 100, checked by a test): `poop 20`,
    `mushroom 15`, `diamond 5`, `vest 3`, `hat 3`, `nothing 54`.
  - `rollLoot(rngValue: number): LootEntry` — pure cumulative-weight-boundary
    picker. Independently testable; boundaries pinned exactly in
    `tests/unit/core/loot.test.ts` (e.g. `rollLoot(0.1999).id === 'poop'`,
    `rollLoot(0.2).id === 'mushroom'`, `rollLoot(0.999999).id === 'nothing'`).
  - `applyDig` rewritten: no longer unconditional. Calls
    `rngStep(state.rngSeed)` **exactly once per dig** (same pattern as the
    seed-consuming loops in `state.ts`'s `createInitialState` and the hazard
    schedule roll), gets `{ value, nextSeed }`, calls `rollLoot(value)`, and
    always writes the new `rngSeed` back onto the returned state (even for
    'nothing', so the RNG stream still advances identically for everyone).
  - `DIAMOND_SCORE = 50`, `VEST_SCORE = 10`, `RARE_HAT_SCORE = 10` — new
    tuning constants, same style/location as the P2-01 constants block.

### RNG / determinism decision

Followed the established convention exactly rather than introducing a bare
injectable `Math.random`: `state.rngSeed` lives on `GameState` and is only
ever advanced via the pure `rngStep(seed) -> {value, nextSeed}` (see
`src/core/rng.ts`, already used by `createInitialState`'s otter/item/hazard
placement). Because `reduce()` only runs authoritatively (server in
multiplayer, local in single-player — see `src/core/tick.ts`), threading the
loot roll through `state.rngSeed` the same way makes every client/server see
the identical roll for a given tick with zero extra network plumbing —
exactly the existing pattern for fish/hazard placement.

### Gear representation decision

Added `OtterState.gear?: { vest?: boolean; rareHat?: boolean }` — a small
additive object, deliberately **separate** from the existing single
`hat: HatType | null` cone slot (that slot's exhaustive `HatType = 'cone'`
type and P2-04 eagle-immunity check were left untouched). `gear` is meant to
be extended by future gear pieces without touching the cone hat contract.

### Outcome behaviour

| Outcome | Ground item? | Pit? | Score | Gear | Notes |
|---|---|---|---|---|---|
| `poop` | dirt (existing) | yes | — | — | byte-identical to pre-P4-6 dig: same `dirt-{otterId}-t{tick}` item id, same pit id/shape, same `dugDirt`/`itemSpawned`/`pitCreated` events |
| `mushroom` | mushroom | no | — | — | ground item spawned at dig spot; picked up + eaten separately via P4-5 |
| `diamond` | no | no | +50 (`DIAMOND_SCORE`) | — | instant score to the digger |
| `vest` | no | no | +10 (`VEST_SCORE`) | `gear.vest = true` | |
| `hat` | no | no | +10 (`RARE_HAT_SCORE`) | `gear.rareHat = true` | does not touch the cone `hat` slot |
| `nothing` | no | no | — | — | zero state change (no pit, no item, no score) — verified by test |

Every outcome (including `nothing`) emits a new `lootRolled` event.

## Existing test changes (why they were needed)

`applyDig` was unconditional before P4-6, so `tests/unit/core/items.test.ts`'s
4 dig tests (`setup([])` + `seed: 1`, 3 players) all relied on that
unconditional behaviour without pinning any roll. With the new weighted
roll, the first `rngStep` off that setup's post-init seed lands in the
`nothing` bucket, not `poop` — so those 4 tests now explicitly set
`state.rngSeed = POOP_ROLL_SEED` (`= 7`, whose first `rngStep().value` ≈
0.0117, inside `[0, 0.20)`) right before calling `dig`, to keep testing the
poop-path pratfall behaviour unchanged. `tests/unit/core/loot.test.ts` is
the new, dedicated home for exercising the other 5 outcomes and the
`rollLoot` boundaries themselves.

Two unrelated compile errors surfaced from the additive `ItemType` member
(TS `Record<ItemType, ...>` exhaustiveness) and were fixed minimally:
- `src/game/render-map.ts`'s `ITEM_FRAME: Record<ItemType, string>` needed a
  `mushroom` entry. No mushroom art exists yet in the asset pipeline, so
  this is a placeholder frame name (`obj_mushroom_0`) that will 404 against
  the real atlas — deliberately **not** added to `render-map.test.ts`'s local
  `ITEM_TYPES` contract-check array, so the atlas contract test doesn't fail
  until the art pipeline actually produces that frame.
- `tests/unit/core/state.test.ts`'s local `byType` tally object (item-type
  distribution assertion) needed a `mushroom: 0` key; `createInitialState`'s
  default scatter never produces mushrooms today, so the count assertion
  itself didn't change.

## Test results

- Before: 322 tests (43 files) green, tsc/eslint clean (baseline on
  `feat/P4-loot` branch point).
- After: 336 tests (44 files) green — +3 mushroom tests in
  `items.test.ts`, +11 in the new `loot.test.ts` (LOOT_TABLE weight sum,
  rollLoot boundaries x2, purity, and all 6 dig outcomes + 1 regression
  check that the pit digger-grace mechanic still works post-refactor).
  `npm run check` fully green (tsc --noEmit && eslint . && vitest run).

## For P4-endgame (stats/titles): exactly what to listen to

Listen for the **`lootRolled`** event (fires once per successful `dig`
command, one entry per player action — not per tick):

```ts
{
  type: 'lootRolled';
  playerId: string;
  outcome: 'poop' | 'mushroom' | 'diamond' | 'vest' | 'hat' | 'nothing';
  itemId?: string;        // set for 'poop' (the dirt item id) and 'mushroom' (the ground mushroom item id); undefined otherwise
  scoreAwarded?: number;  // set for 'diamond' (50) / 'vest' (10) / 'hat' (10); undefined otherwise
}
```

Per-player tallying recipe:
- `poopsDug++` when `outcome === 'poop'`.
- `mushroomsDug++` (ground mushrooms unearthed) when `outcome === 'mushroom'`.
  Note this counts *dug* mushrooms, not *eaten* mushrooms — if the stat you
  want is "mushrooms eaten," instead count `itemEaten` events where
  `itemType === 'mushroom'` (P4-5 reuses that existing event; no new one).
- `diamondsFound++` when `outcome === 'diamond'` (`scoreAwarded` will be
  `DIAMOND_SCORE`, currently 50 — import the constant from
  `src/core/items.ts` rather than hardcoding 50).
- `vestsFound++` / `hatsFound++` similarly for `'vest'` / `'hat'`.

Also useful, not new events but existing state fields worth reading at
game-end for titles:
- `otter.mushroomStacks` (0..4) / `otter.scale` — final mushroom-eating
  progress per player (P4-5).
- `otter.gear?.vest` / `otter.gear?.rareHat` — booleans, whether that player
  is currently wearing loot-table gear (P4-6). Note gear is never removed
  by any code in this slice (no "stunned knocks gear off" — that behavior
  exists only for the cone `hat` slot via `applyStun`), so these persist for
  the whole match once true.
