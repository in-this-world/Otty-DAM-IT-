# P4-7: shared 準備室 drawing canvas

## What shipped

- `src/net/draw-batch.ts` - pure `makeDrawBatch(opts)` batching/flush module.
  `addPoint(x, y)` buffers integer-snapped `[x|0, y|0]` pairs and never sends
  anything on its own; `tick(dtMs)` accumulates elapsed time and, once past
  `flushMs` (default 50) with a non-empty buffer, calls `opts.send(...)`
  exactly once with the buffered points (in order), then clears the buffer
  and resets the elapsed timer. Ticking with an empty buffer never calls
  `send`. Fully unit-tested, no DOM/Colyseus dependency.
- `src/net/protocol.ts` - added `ClientMessage.Draw` ('draw'),
  `ClientMessage.ClearDrawing` ('clearDrawing'), `ServerMessage.Draw`
  ('draw'), `ServerMessage.ClearDrawing` ('clearDrawing'), plus
  `DrawMessage`, `DrawBroadcast`, `ClearDrawingBroadcast` payload types, and
  a `doodleCount: number` field on `RosterEntry`.
- `src/net/room-sim.ts` - `RoomSimulation.recordDrawBatch(sessionId)`
  increments a private `Map<string, number>`; `doodleCount(sessionId)` reads
  it (0 for unknown/never-drawn sessions). Also added
  `getProfileBySession(sessionId)` so the server can look up a drawer's own
  hatColor by session (not otter id) without trusting anything the client
  sends.
- `src/server/DamRoom.ts` - relays `ClientMessage.Draw` as
  `ServerMessage.Draw` (stamped with `sessionId` + the sender's own
  hatColor from `getProfileBySession`, ignoring any client-supplied color),
  calls `sim.recordDrawBatch(sessionId)` once per relayed batch, and relays
  `ClientMessage.ClearDrawing` as `ServerMessage.ClearDrawing`
  (`{ sessionId }`). Not gated on lobby phase - harmless to allow anytime,
  per the design doc's call to keep this simple. `doodleCount` is now
  included in every roster payload entry via `this.sim.doodleCount(p.sessionId)`.
- `src/game/lobby/LobbyOverlay.ts` - `renderReadyRoom`'s room parameter was
  widened to a `RoomLike` interface (`sessionId`, `send`, `onMessage`) so it
  can subscribe to the new broadcasts; a `<canvas>` (400x200 internal
  resolution, CSS-scaled to the card width, 160px tall) is lazily built once
  per connection via `ensureDrawingCanvas()` - NOT recreated on every roster
  re-render, since `renderReadyRoom` calls `root.replaceChildren()` on every
  roster broadcast and a naive rebuild would re-wire pointer listeners,
  re-subscribe to broadcasts, and start a second flush interval each time.
  The same `wrap` element is re-appended into the fresh card each render.
  Pointer events (pointerdown/pointermove/pointerup/pointerleave) feed a
  `makeDrawBatch` instance (color = own hatColor), driven by a
  `setInterval(50)` calling `batch.tick(50)` - cleared in `stop()`. Incoming
  `ServerMessage.Draw`/`ServerMessage.ClearDrawing` broadcasts update a
  `Map<sessionId, {color, pts}>` and redraw incrementally (`strokeSegment`)
  or fully (`strokeLine`, used after a clear). A `t('drawing.clearMine')`
  button sends `ClientMessage.ClearDrawing` and clears the local session's
  strokes optimistically before the round-trip. When the roster phase flips
  to playing/ended, `stopDrawingCanvas()` fades the wrap to opacity 0 over
  400ms then calls `stop()` (clears the interval, removes listeners) and
  removes the DOM node; the same teardown runs on `close()` so nothing leaks
  if the overlay is torn down mid-lobby.
- `src/locale/zh-TW.ts` / `src/locale/en.ts` - added `drawing.clearMine`
  ('Clear My Doodle' zh-TW string) to both dictionaries.

## Batching design confirmation

Never one network message per pointer-move event. Every pointermove only
calls `batch.addPoint(x, y)`, a pure in-memory buffer push - no network
call. The only place a `ClientMessage.Draw` is sent is inside
`makeDrawBatch`'s `send` callback, invoked from `batch.tick(50)` on a
`setInterval(50)`, and only when the buffer is non-empty. Pinned down by
`tests/unit/net/draw-batch.test.ts` (8 tests: no send from addPoint alone,
no send short of the threshold, exactly one send with both points in order
once past 50ms, integer-snapping, fresh buffer after a flush, no send ever
on an empty buffer, elapsed-timer reset after a flush, custom flushMs).

## Stroke-count tracking decision

Server-side, in RoomSimulation - chosen over the client-side alternative
because the roster payload already carries a natural per-session home for
it (RosterEntry.doodleCount), and the server is the single authoritative
source every client already reconciles against; a client-side-only count
would require another broadcast to sync between players and could be
spoofed/lost on reconnect. DamRoom calls
`sim.recordDrawBatch(client.sessionId)` exactly once per relayed
ClientMessage.Draw (once per flushed batch, not per point).

For P4-endgame to consume: read `doodleCount` off each entry in the
`RosterPayload.players` array (the existing `ServerMessage.Roster`
broadcast - no new message needed). The highest doodleCount across the
final roster is the "most doodles" fallback-title winner. Ties are not
broken here (left to the endgame branch - e.g. earliest joinSeq or a shared
title). `RoomSimulation.doodleCount(sessionId)` is also directly callable
server-side outside the roster payload path.

## Accepted limitation (documented, not a bug)

The server does NOT persist canvas state. It only relays draw/clearDrawing
messages between currently-connected clients. A late joiner (or a
reconnecting client) sees a blank canvas - intentional transient lobby
decoration, not game state.

## Deviations from the design doc

- The client->server `ClientMessage.Draw` wire payload only sends `{ pts }`
  (no color) since the server derives color from the sender's own profile
  server-side, per the design doc's spoofing guard. makeDrawBatch's internal
  send callback still carries color (as specified); LobbyOverlay strips it
  back out before the actual room.send call.
- doodleCount is NOT embedded directly on RoomSimulation.roster() entries.
  An initial approach mapped roster()'s return value to add it, but that
  broke RoomSimulation.step()'s mutate-through-reference pattern for
  reconnectMsLeft (roster() entries are live references used elsewhere).
  doodleCount is instead a separate `doodleCount(sessionId)` lookup method,
  joined onto each RosterEntry only at the DamRoom wire-payload boundary.

## Test results

- Before: 310 tests passing (42 files) on main @ 8247006.
- After: 322 tests passing (43 files) - tests/unit/net/draw-batch.test.ts
  (8 new tests) + 4 new tests in tests/unit/net/room-sim.test.ts
  (doodle-count: starts at zero, increments independently per session,
  returns 0 for unknown sessions, queryable regardless of roster membership).
- npm run check (tsc --noEmit && eslint . && vitest run) is fully green.
- DamRoom.ts itself remains outside Vitest coverage (needs a live server,
  per its existing file comment) - the new relay code there is kept
  deliberately simple/obviously-correct. Real coverage lives in
  draw-batch.ts and the RoomSimulation doodle-count tests.
- Live sanity check (Claude-in-Chrome against a running dev server) was not
  performed for this slice - optional per the task brief, not blocking.

## Follow-ups for P4-endgame

- Read doodleCount off RosterPayload.players[i].doodleCount (already
  flowing through the existing ServerMessage.Roster broadcast - no new
  wiring needed) to compute a "most doodles" fallback title.
- If a tie-break rule is needed, joinSeq/otterId ordering is available on
  the same roster entries.
