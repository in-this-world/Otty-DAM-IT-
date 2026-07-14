# P3-01 — Colyseus server (room schema, core on server, 20 Hz tick)

**What was done**
- `src/net/protocol.ts` — pure shared protocol: room codes (`roomCodeFromSeed`, `normalizeRoomCode`, `parseJoinLink`, `#/r/ABCD`), `PlayerProfile` + `sanitizeProfile`, connection states + `NetErrorCode`/messages, message channels, `SnapshotPayload`. Zero Colyseus/Phaser imports.
- `src/net/room-sim.ts` — `RoomSimulation`: the authoritative loop. Owns a `GameState`, advances it with the same pure `reduce` pipeline as `LocalAdapter`. Adds multiplayer: lobby roster (join/leave, dense `otter-1..N`), owner handoff, mid-game spectators, and the disconnect policy — 30 s reconnection window with AI takeover (`planOtterCommands`), then otter removal + dam requirement rescale (`n^0.85`). Deterministic + clock-injected.
- `src/server/schema.ts` — `LobbySchema`/`PlayerSchema` (decorator-free `defineTypes`); only the low-frequency roster rides Colyseus delta-sync (what the 準備室 UI binds to).
- `src/server/DamRoom.ts` — thin Colyseus glue: mirrors the roster into the schema, runs a 20 Hz simulation interval broadcasting a full `snapshot` per tick, bridges `allowReconnection(30s)`.
- `src/server/index.ts` — server entry (`define('dam', DamRoom).filterBy(['roomCode'])`). Hosting deferred.

**Key decisions**
- One source of truth: lobby/roster via schema, fast game state via full `snapshot` messages (no GameState↔schema mirroring / divergence). Can optimize to deltas later.
- Server stamps the authoritative `playerId` on every command (anti-cheat); forged ids ignored.

**Tests** — `tests/unit/net/room-sim.test.ts` (13): roster/owner, code determinism, profile sanitize, 10-cap+spectate, owner-gated start, `n^0.85` scaling, playerId stamping, spectator drop, disconnect→AI→remove→rescale, reconnect, owner handoff.

**Follow-ups** — real hosting (boss decision); optional schema-delta game state.
