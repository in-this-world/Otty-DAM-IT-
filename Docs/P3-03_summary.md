# P3-03 — Lobby / 準備室 / join link + spectate + connection-state UX

**What was done**
- `src/net/lobby-controller.ts` — pure connection-state machine: validates/normalizes room codes, parses `#/r/ABCD` deep links, turns network events (connecting/welcome/error/disconnect/reconnect) into a `{ state, message, roomCode, localPlayerId, spectator }` view with zh-TW copy + error codes.
- `src/game/lobby/LobbyOverlay.ts` — DOM overlay (outside Phaser): personalization (nickname + hat/scarf colour, persisted), Create/Join by code, 準備室 roster with ready toggles + owner 👑 + share link, spectator notice, connection banner. Resolves with a connected `ColyseusAdapter` + `localPlayerId` when the round starts.
- Opt-in wiring: `src/main.ts` shows the lobby only when a `#/r/ABCD` link or `?net` flag is present AND `VITE_COLYSEUS_URL` is set; otherwise boots single-player unchanged. `GameScene` accepts an injected net adapter via the Phaser registry (skips local AI, uses the local otter id for input, spectators send nothing, guards `getState()` pre-first-snapshot).

**Key decisions**
- Multiplayer is strictly opt-in and gated on a configured server URL → the deployed site stays pure single-player until hosting exists; `main` stays green + playable.

**Tests** — `lobby-controller.test.ts` (5): deep-link parse, code validation, connecting→connected, spectator, error copy + reconnect flow. DOM overlay + live networked play need in-browser verification (blocked on hosting).
