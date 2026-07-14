/**
 * DamRoom — thin Colyseus glue over the pure RoomSimulation (P3-01).
 *
 * Colyseus owns transport + the reconnection primitive; RoomSimulation owns
 * all game logic. The room:
 *   - creates a sim (deterministic seed -> room code),
 *   - mirrors the roster into the synced LobbySchema on every change,
 *   - runs a 20 Hz simulation interval once the owner starts, broadcasting a
 *     full snapshot per tick,
 *   - bridges Colyseus's allowReconnection(30 s) to sim.reconnect / removal.
 *
 * Not exercised by Vitest (needs a live server); kept tiny so the tested sim
 * carries the logic. Type-checked by `npm run check`.
 */
import { Room, ServerError } from 'colyseus';
import type { Client } from 'colyseus';
import { DEFAULT_TICK_MS } from '../core/adapter';
import {
  ClientMessage,
  RECONNECT_SECONDS,
  ServerMessage,
  type ClientCommand,
  type PlayerProfile,
} from '../net/protocol';
import { RoomSimulation } from '../net/room-sim';
import { LobbySchema, PlayerSchema } from './schema';

export interface DamRoomOptions {
  readonly seed?: number;
  readonly roomCode?: string;
  readonly timerMs?: number;
}

export class DamRoom extends Room<{ state: LobbySchema }> {
  /** Hard clients cap; spectators are allowed on top of the 10 otters. */
  maxClients = 50;
  private sim!: RoomSimulation;
  private looping = false;

  override onCreate(options: DamRoomOptions): void {
    const seed = (options.seed ?? Date.now()) >>> 0;
    this.sim = new RoomSimulation({
      seed,
      ...(options.roomCode ? { roomCode: options.roomCode } : {}),
      ...(options.timerMs !== undefined ? { timerMs: options.timerMs } : {}),
    });

    const state = new LobbySchema();
    state.roomCode = this.sim.roomCode;
    this.setState(state);
    void this.setMetadata({ roomCode: this.sim.roomCode });

    this.onMessage(ClientMessage.SetProfile, (client, msg: Partial<PlayerProfile>) => {
      this.sim.setProfile(client.sessionId, msg);
      this.syncRoster();
    });
    this.onMessage(ClientMessage.SetReady, (client, msg: { ready?: boolean }) => {
      this.sim.setReady(client.sessionId, Boolean(msg?.ready));
      this.syncRoster();
    });
    this.onMessage(ClientMessage.StartGame, (client) => {
      if (this.sim.start(client.sessionId)) {
        this.state.phase = 'playing';
        this.syncRoster();
        this.startLoop();
      }
    });
    this.onMessage(ClientMessage.Command, (client, msg: ClientCommand) => {
      this.sim.enqueue(client.sessionId, msg);
    });
  }

  override onJoin(client: Client, options: { profile?: Partial<PlayerProfile> } = {}): void {
    const res = this.sim.join(client.sessionId, options.profile);
    client.send(ServerMessage.Welcome, {
      playerId: res.otterId,
      roomCode: this.sim.roomCode,
      spectator: res.spectator,
    });
    this.syncRoster();
  }

  override async onLeave(client: Client): Promise<void> {
    const wasPlaying = this.sim.phase === 'playing';
    this.sim.disconnect(client.sessionId);
    this.syncRoster();

    if (wasPlaying) {
      try {
        // Consented leaves reject immediately; genuine drops wait the window.
        await this.allowReconnection(client, RECONNECT_SECONDS);
        this.sim.reconnect(client.sessionId);
      } catch {
        // Window elapsed / consented; the sim removes the otter as it ticks.
      }
      this.syncRoster();
    }
  }

  private startLoop(): void {
    if (this.looping) return;
    this.looping = true;
    this.setSimulationInterval((dtMs) => {
      const snap = this.sim.step(dtMs);
      if (!snap) return;
      this.state.tick = snap.state.tick;
      this.broadcast(ServerMessage.Snapshot, snap);
      if (this.sim.phase === 'ended' && this.state.phase !== 'ended') {
        this.state.phase = 'ended';
      }
    }, DEFAULT_TICK_MS);
  }

  /** Rebuild the synced roster from the authoritative sim. */
  private syncRoster(): void {
    const players = this.state.players;
    players.clear();
    for (const p of this.sim.roster()) {
      const ps = new PlayerSchema();
      ps.otterId = p.otterId ?? '';
      ps.nickname = p.profile.nickname;
      ps.hatColor = p.profile.hatColor;
      ps.scarfColor = p.profile.scarfColor;
      ps.ready = p.ready;
      ps.connected = p.connected;
      ps.spectator = p.spectator;
      ps.owner = p.sessionId === this.sim.ownerId;
      players.set(p.sessionId, ps);
    }
  }
}

/** Re-exported so a host can `throw new ServerError(...)` on bad options. */
export { ServerError };
