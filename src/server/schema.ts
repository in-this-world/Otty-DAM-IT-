/**
 * Colyseus room schema (P3-01). Only the *lobby/roster* rides Colyseus's
 * built-in delta sync — nicknames, colours, ready flags, who's the owner,
 * the room code and phase — because that's exactly the low-frequency data the
 * 準備室 UI (P3-03/05) binds to. The high-frequency game snapshot travels as a
 * `snapshot` message (see protocol.ts), keeping a single serializable source
 * of truth in RoomSimulation rather than mirroring all of GameState here.
 *
 * Uses the decorator-free `defineTypes` API so we don't have to turn on
 * experimentalDecorators in the shared tsconfig.
 */
import { defineTypes, MapSchema, Schema } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  otterId = '';
  nickname = '';
  hatColor = '';
  scarfColor = '';
  ready = false;
  connected = true;
  spectator = false;
  owner = false;
}

defineTypes(PlayerSchema, {
  otterId: 'string',
  nickname: 'string',
  hatColor: 'string',
  scarfColor: 'string',
  ready: 'boolean',
  connected: 'boolean',
  spectator: 'boolean',
  owner: 'boolean',
});

export class LobbySchema extends Schema {
  roomCode = '';
  /** 'lobby' | 'playing' | 'ended' — mirrors RoomSimulation.phase. */
  phase = 'lobby';
  /** Latest server tick, so late-joining spectators see the game is live. */
  tick = 0;
  players = new MapSchema<PlayerSchema>();
}

defineTypes(LobbySchema, {
  roomCode: 'string',
  phase: 'string',
  tick: 'number',
  players: { map: PlayerSchema },
});
