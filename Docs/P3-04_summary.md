# P3-04 — Multiplayer tests / validation

**What was done** — `tests/unit/net/multiplayer.integration.test.ts` (3), driving the real server loop (`RoomSimulation` + shared `planOtterCommands`):
- two otters cooperatively build the dam to a **win** (seed 7, required = `round(20·2^0.85)`);
- a **10-otter** room fills and the 11th **spectates**; required scales `n^0.85`;
- a **mid-game dropout** is AI-covered, then removed when the 30 s window lapses, and the room **plays on to a win** with the requirement rescaled to a solo wall.

**Validation** — `npm run check` green: **301 unit tests** + tsc + eslint. `npm run build` green (bundle ~1.37 MB; >500 kB warning is the pre-existing P4 code-split item). In-sandbox E2E: smoke passes with visual-baseline match (single-player boot/render intact after the injection wiring); the 2 mechanics failures are pre-existing/flaky under software-GL (identical with the changes reverted).

**Follow-ups** — live 2-browser E2E + disconnect/reconnect over a real Colyseus host (needs hosting).
