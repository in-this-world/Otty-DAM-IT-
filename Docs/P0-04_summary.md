# P0-04 Summary — Core Skeleton (command → state → events)

Owner: Developer agent · Date: 2026-07-02 · Status: done, `npm run check` green (42 tests).

## Files

| File | Purpose |
|---|---|
| `src/core/types.ts` | All shared types: `Vec2`, `Direction`, `ItemType`, `OtterAction`, `OtterState`, `ItemState`, `GamePhase`, `DamState`, `GameState`, `Command` (discriminated union), `GameEvent` (discriminated union) |
| `src/core/rng.ts` | Deterministic mulberry32: `rngStep(seed)` pure single-step (seed lives in `GameState.rngSeed`), `mulberry32(seed)` stateful wrapper |
| `src/core/state.ts` | `createInitialState(config)` — pure, deterministic; `GameConfig` with defaults (`DEFAULT_TIMER_MS = 240_000`, dam required = playerCount × 20, world 1280×720, players clamped 1..10) |
| `src/core/tick.ts` | `reduce(state, commands, dtMs, systems?)` → `{ state, events }` — PURE, structural sharing; command validation + P0 stub events; `System` pipeline type |
| `src/core/adapter.ts` | `GameAdapter` interface + `LocalAdapter`; `TickScheduler` abstraction with `ManualScheduler` (tests) and `IntervalScheduler` (browser, 20 Hz `DEFAULT_TICK_MS = 50`) |
| `tests/unit/core/*.test.ts` | 28 tests: rng (5), state (6), tick (11), adapter (6) |

## Architecture decisions

1. **Immutable reduce with structural sharing.** `reduce` never mutates input; unchanged branches keep identity (`state.otters === input.otters` on an empty tick — asserted in tests). Cheap for the render layer to diff, safe for lockstep/replay.
2. **Tick counter always advances; nothing else does on an empty tick.** Test asserts `result.state` deep-equals `{ ...input, tick: input.tick + 1 }` and events are exactly `[tickCompleted]`.
3. **Seed-in-state RNG.** `GameState.rngSeed` holds the current mulberry32 seed; systems must use pure `rngStep(seed) → { value, nextSeed }` and store `nextSeed` back. Same seed ⇒ byte-identical states — verified by tests, and required for P3 server authority.
4. **Commands are untrusted input.** Every command is validated in the reducer (unknown player / wrong phase / unknown runtime type ⇒ `commandRejected` with a `reason` string). This is the server-authoritative posture P3 needs; clients can render rejection feedback from the event.
5. **Phase defaults to `'playing'`.** Local rounds start immediately; lobby flow (P3) passes `phase: 'lobby'` explicitly, in which all gameplay commands are rejected with `notPlaying`.
6. **Clock is injected.** `LocalAdapter` takes a `TickScheduler`; unit tests use `ManualScheduler.advance(dtMs)` — zero real timers in the test suite. Browser uses `IntervalScheduler(50)` (20 Hz, same as the planned Colyseus tick).
7. **ESLint Phaser ban in `src/core/` untouched and honored** — core imports nothing but its own modules.

## P0 command semantics (stubs)

| Command | P0 result |
|---|---|
| `move` / `stop` / `poke` / `build` | validated, emits `otterMoved` / `otterStopped` / `otterPoked(targetId: null)` / `buildAttempted`; **no state change yet** |
| `pickUp` | rejected `noItemInRange` (no items exist in P0) |
| `drop` / `useItem` | rejected `notCarrying` / `nothingToUse` (carrying is always null in P0) |
| any, wrong player | rejected `unknownPlayer` |
| any, phase ≠ playing | rejected `notPlaying` |
| unknown runtime type | rejected `unknownCommandType` |

## Extension points for P1 (how to plug in)

- **P1-01 movement:** in `applyCommand` `'move'`/`'stop'` branches set `facing`/`action` (and a velocity field if desired), then add a movement `System` to the pipeline that integrates `pos` by `dtMs` and clamps to `GameConfig.world`. `System = (state, dtMs, events) => state`; pass via `reduce(..., systems)` or `LocalAdapter` `options.systems`, or append to `defaultSystems`.
- **P1-02 inventory:** implement `pickUp`/`drop` branches against `state.items` (`ItemState.heldBy`), emit `itemPickedUp`/`itemDropped`; item spawning as a system using `rngStep` + `rngSeed`.
- **P1-03 dam:** `build` branch consumes `carrying`, emits `damProgressed`; win check (`progress >= required` ⇒ phase `'won'` + `gameWon`) as a system or in the branch. `dam.required` scaling already lives in `createInitialState`.
- **P1-04 timer:** a system subtracting `dtMs` from `timerMs`; at ≤0 set phase `'won' | 'lost'` and emit `gameWon`/`gameLost`.
- **P1-05 render:** Phaser GameScene consumes only `GameAdapter` (`onState` for interpolation targets, `onEvents` for one-shot anims/SFX); expose `adapter.getState()` on `window.__otty` for Playwright.
- **P2 items/events:** `useItem` branch + `ItemType`-specific effects; eagle/bear as systems emitting new event variants (extend the `GameEvent` union — note cross-lane type changes go through STATE.md Decisions per MASTER_PLAN §5.3).
- **P3 Colyseus:** implement `ColyseusAdapter implements GameAdapter` in `src/net/`; move `reduce` + `createInitialState` server-side unchanged. Event/command unions are already plain serializable data.

## Test inventory

- `rng.test.ts`: same-seed sequence equality; different seeds differ; range [0,1); `rngStep` purity; `rngStep`↔`mulberry32` chain equivalence.
- `state.test.ts`: same config ⇒ deep-equal; different seed ⇒ different; P0 shape (tick 0, phase, timer, dam, otters count, empty items); spawn invariants (idle, empty-handed, in-bounds); config overrides; playerCount clamp.
- `tick.test.ts`: empty tick = input + tick+1 only, events = `[tickCompleted]`; no input mutation (structuredClone compare); structural sharing; `move`/`poke` ⇒ events; rejections (unknown player, unknown type, lobby phase, pickUp/drop/useItem); command ordering + trailing `tickCompleted`; injected system receives `dtMs` and its state change sticks.
- `adapter.test.ts`: per-tick state delivery via fake clock; command ⇒ event batch delivery; queue drained (command applies once); stop halts / start idempotent; unsubscribe isolates; two same-seed adapters stay in lockstep.
