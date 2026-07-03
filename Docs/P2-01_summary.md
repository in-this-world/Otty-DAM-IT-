# P2-01 — Full item set in the pure core (fish / stone / cone / dirt)

Swimlane A (core). Everything below lives in `src/core/` (zero Phaser
imports) and is covered by `tests/unit/core/items.test.ts` (22 tests) plus
updated `state.test.ts` / `dam.test.ts`.

## New files
- `src/core/items.ts` — command handlers `applyUseItem`, `applyThrow`,
  `applyDig`, shared `applyStun` (also knocks hats off), speed helper
  `effectiveSpeedPerSec`, and all P2-01 tuning constants.
- `src/core/effects.ts` — `effectsSystem`, new pipeline stage (order is now
  movement → effects → dam → timer): decays `stunnedMs` / `speedBoostMs`,
  resolves pit collisions after movement, decays pit grace timers.

## Type additions (all additive)
- `OtterState.speedBoostMs: number` (default 0), `OtterState.hat: HatType | null`
  (default null). New types `HatType = 'cone'`, `StunCause = 'thrownFish' | 'pit'`,
  `PitState { id, pos, diggerId, diggerImmuneMs }`.
- `GameState.pits: readonly PitState[]` (default `[]`).
- Commands: `throwItem`, `dig` (no payload beyond `playerId`).
- Events: `itemEaten`, `itemThrown {from,to}`, `otterStunned {durationMs,cause}`,
  `hatWorn`, `hatKnockedOff {itemId}`, `dugDirt {itemId,pos}`,
  `pitCreated {pitId,pos}`, `pitFilled {pitId,playerId}`. Spawned ground items
  (knocked-off cone, dug dirt) also emit the existing `itemSpawned` so the
  render layer has one item-appears path.

## Chosen numbers (constants in items.ts / dam.ts)
| Constant | Value | Note |
|---|---|---|
| FISH_BOOST_MS | 5000 | matches design doc v0.1 §4.2 (5 s 加速), not the 8 s example in the task brief |
| FISH_SPEED_MULT | 1.5 | |
| THROWN_FISH_STUN_MS | 2000 | per task brief (v0.1 said 1.5 s — revisit in playtest) |
| THROW_DISTANCE / THROW_HIT_RADIUS | 160 / 40 | fish hits the *first* otter within 40 u of the flight segment; lands at their feet, else at full distance (world-clamped) |
| STONE_CARRY_SPEED_MULT | 0.5 | |
| BUILD_AMOUNTS | branch 1, dirt 1, stone 3 | build reject reason renamed `noBranch` → `noBuildMaterial` (dam.test updated; nothing outside core referenced it) |
| PIT_RADIUS / PIT_STUN_MS / PIT_DIGGER_IMMUNE_MS | 32 / 1500 / 2000 | pit fills itself after catching exactly one otter; digger falls into their own pit once grace expires (intended pratfall) |

## Behaviour notes
- **Stun**: any command from a stunned otter is rejected with reason
  `stunned`; stun zeroes `vel` and clears `wantsBuild`; movementSystem also
  skips stunned otters. Getting stunned (fish or pit) knocks a worn cone off
  as a fresh ground item (`cone-<otterId>-t<tick>`).
- **Speed model**: `vel` stores intent; `movementSystem` recomputes the
  applied magnitude each tick via `effectiveSpeedPerSec` (base × 1.5 fish
  boost × 0.5 stone), so buffs expire and stones weigh you down mid-walk.
- **Dig**: instant, empty paws required (`handsFull` otherwise); every dig
  spawns one dirt item at the otter's feet + one pit at the same spot
  (deterministic ids `dirt-/pit-<otterId>-t<tick>`).
- **Default scatter** (state.ts): still `ceil(required * 2)` items, now
  every 8th is a fish and every 8th-offset-4 a stone, rest branches
  (ids `<type>-<i>`). state.test count expectation unchanged; type
  assertions updated.

## Cut / simplified (documented per brief)
- Cone-as-build-material (v0.1 marks 🚧 as buildable): omitted; cone's
  identity is the hat. Add to `BUILD_AMOUNTS` later if playtests want it.
- Hat knock-off on **poke** is a P2-02 hook: poke still has no hit
  detection; when P2-02 lands, call `applyStun` (items.ts) — it already
  handles the knock-off. Hat eagle-immunity check itself is P2-04.
- No fishy-smell debuff (被丟魚吸引老鷹), no held-item knock-off on stun
  (only hats drop), no 1 s stone pickup channel, no pit lifetime — pits
  persist until someone falls in.
- `itemUsed` event kept in the union for compatibility but eat/wear emit
  the specific `itemEaten` / `hatWorn` instead.

## Verification
- `npx vitest run tests/unit/` → 118 passed (18 files).
- `npx tsc --noEmit` clean; `npx eslint src/core tests/unit/core` clean.
- Full `npm run check` skipped on purpose: a concurrent agent owns
  `src/game/`/`tests/e2e/` and may be mid-edit.
