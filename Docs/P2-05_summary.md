# P2-05: AI otter behaviour tree + tests

## What was done
Added a pure, stateless AI controller for otters and a full test suite.

- **`src/core/ai.ts`** (new) — zero Phaser imports, pure functions.
  - `planOtterCommands(state: GameState, otterId: string): Command[]` — the planner.
  - `directionToward(from: Vec2, to: Vec2): Direction` — dominant-axis step helper.
  - `recommendedAiCount(humanCount: number, target = 4): number` — "人數平衡" lobby fill.
- **`tests/unit/core/ai.test.ts`** (new) — 14 tests covering every branch + acceptance.

No existing file was touched. The AI is an **external advisor**: the caller feeds
its returned commands straight into the existing `reduce()` loop (like the scripted
human commands in `simulation.test.ts`). No wiring, no type changes.

## Behaviour-tree decisions (撿 → 搬 → 建)
1. Otter missing or `stunnedMs > 0` → `[]` (can't act).
2. Carrying a **build material** (`BUILD_AMOUNTS[carrying] !== undefined`; branch/dirt/stone):
   - within `BUILD_RADIUS` of `dam.site` → `[stop, build]`.
   - else → `[move toward dam.site]` (dominant axis).
3. Carrying a **non-material** (e.g. fish) → `[drop]`. Design choice: only materials
   advance the dam, so the AI immediately frees its paws rather than hauling junk.
4. Empty-handed → nearest **free** (`heldBy===null`) material:
   - within `PICKUP_RADIUS` → `[stop, pickUp{itemId}]` (targets by id, no ambiguity).
   - else → `[move toward it]`.
   - none exist anywhere → `[stop]`.

Each action command is prefixed with `stop` so the otter halts exactly on the target
instead of drifting past on its carried velocity (movement runs after commands).
The planner is **stateless** (no memory between ticks) → replay-safe and server-portable (P3).

## Seed used and why
Acceptance tests use **seed 7**, `world 1000x800`, `timerMs 240000`, `TICK_MS 50`.
Seed 7 was the first tried and both the solo and 2-otter cooperative rounds win
comfortably before the flood with the default deterministic item scatter (no explicit
`items` array needed — the AI does all picking/carrying/building itself). The loop is
guarded at `< 6000` iterations.

## Test results
`npm run check` fully green: tsc --noEmit + eslint + vitest.
- 19 test files, **132 tests passed** (118 pre-existing + 14 new).
- New tests: directionToward axis choice; missing/stunned → []; pickUp in range;
  ignore held/non-material items; move toward far branch; stop when no material;
  carry→move to dam; carry→build in range; carry fish→drop; recommendedAiCount;
  solo acceptance (won, timer > 0); 2-AI cooperative acceptance.

## Follow-ups
- **Not yet wired into the game loop.** Hooking `planOtterCommands` into the Phaser/net
  layer (spawn N AI otters via `recommendedAiCount`, call the planner each tick, feed
  results to `reduce`) is a game-layer task, not core.
- Pathfinding is greedy dominant-axis only; fine for the open party arena but could
  snag on future obstacles/pits. Could add pit-avoidance later.
- AI ignores power-ups (fish boost, cones, digging) — a pure fill-in worker for now.
