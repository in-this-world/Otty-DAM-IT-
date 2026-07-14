# P3-02 — ColyseusAdapter (GameAdapter + prediction/interpolation)

**What was done**
- `src/net/interpolation.ts` — pure view smoothing: `interpolateSnapshots(a,b,t)` (lerp remote otters/items, discrete fields from newer), `extrapolateOtter` (local dead-reckoning; mirrors `movementSystem` exactly), `SnapshotBuffer` (samples at a delayed render clock).
- `src/net/transport.ts` — `NetTransport` seam + `LoopbackTransport` (runs a real `RoomSimulation` in-process behind a manual clock; "multiplayer on one machine" for tests + hosting-free local dev).
- `src/net/ColyseusAdapter.ts` — implements `GameAdapter`. Client→server relays bare commands (server stamps id); server→`snapshot` feeds the buffer; a render loop publishes a smoothed view each frame: remotes interpolated ~80 ms in the past, local otter predicted to `now` from last authoritative pose + current input intent.
- `src/net/colyseus-connect.ts` — real colyseus.js glue (`joinRoom`, `transportForRoom`, `connectColyseus`); synthesizes `welcome` from the first state sync to dodge the join/handler race. Untested (hosting deferred), type-checked.

**Key decisions**
- Prediction = local-only dead reckoning + snap-on-snapshot (no server per-input acks needed → committed P3-01 untouched). Interpolation = past-render for remotes.
- Transport injected → the adapter unit-tests without a network.

**Tests** — `interpolation.test.ts` (7) + `adapter.conformance.test.ts` (7): a shared GameAdapter contract passes for **both** `LocalAdapter` and `ColyseusAdapter` (loopback), plus a parity test proving `RoomSimulation` matches `LocalAdapter` tick-for-tick (same core on the server).
