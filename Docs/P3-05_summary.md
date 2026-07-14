# P3-05 — 準備室 personalization (nickname + hat/scarf colour + name tag)

**What was done**
- `src/net/protocol.ts` — `PlayerProfile` (nickname/hatColor/scarfColor), `PLAYER_COLORS` palette (colour-blind-safe), `sanitizeProfile` (trim→clamp 12, hex-validate, defaults), `defaultProfile`.
- `src/net/profile-store.ts` — no-login persistence: `loadProfile`/`saveProfile` over an injected `KeyValueStore` (localStorage in prod), `cycleColor` (palette next/prev), `nameTagText` (overhead name-tag text).
- Wired into `LobbyOverlay` (nickname input + colour swatches, persisted across sessions) and carried on the server roster (`RoomSimulation.getProfile(otterId)` / `LobbySchema.players`) for name tags + colours.

**Key decisions** — profiles are client-owned and server-sanitized; never trusted raw.

**Tests** — `profile-store.test.ts` (5): default when empty, sanitized round-trip, corrupt-JSON fallback, colour cycling/wrap, name-tag fallback. (Server sanitize + per-otter recall also covered in `room-sim.test.ts`.)
