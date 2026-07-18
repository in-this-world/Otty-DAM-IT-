/**
 * DamRoom — thin Colyseus glue over the pure RoomSimulation (P3-01).
 *
 * No Colyseus schema state: the lobby roster rides a `roster` message and the
 * game rides `snapshot` messages (both plain serializable payloads from
 * RoomSimulation). This sidesteps @colyseus/schema entirely — no v3/v4 or
 * decorator-metadata fragility — and keeps ONE source of truth (the sim).
 *
 * Pinned to Colyseus 0.16 to match the colyseus.js 0.16 client. Not exercised
 * by Vitest (needs a live server); the tested sim carries the logic.
 */
import { Room, ServerError } from 'colyseus';
import type { Client } from 'colyseus';
import { DEFAULT_TICK_MS } from '../core/adapter';
import { MULTIPLAYER_TIMER_MS, PLAY_WATER, PLAY_WORLD } from '../core/state';
import {
  ClientMessage,
  RECONNECT_SECONDS,
  ServerMessage,
  type ClientCommand,
  type PlayerProfile,
  type RosterPayload,
} from '../net/protocol';
import { RoomSimulation } from '../net/room-sim';

export interface DamRoomOptions {
  readonly seed?: number;
  readonly roomCode?: string;
  readonly timerMs?: number;
}

export class DamRoom extends Room {
  /** Hard clients cap; spectators are allowed on top of the 10 otters. */
  maxClients = 50;
  private sim!: RoomSimulation;
  private looping = false;

  override onCreate(options: DamRoomOptions): void {
    const seed = (options.seed ?? Date.now()) >>> 0;
    this.sim = new RoomSimulation({
      seed,
      // Match the client arena exactly, else otters spawn off-camera (BUG-06).
      world: PLAY_WORLD,
      water: PLAY_WATER,
      timerMs: options.timerMs ?? MULTIPLAYER_TIMER_MS,
      ...(options.roomCode ? { roomCode: options.roomCode } : {}),
    });
    void this.setMetadata({ roomCode: this.sim.roomCode });

    this.onMessage(ClientMessage.SetProfile, (client, msg: Partial<PlayerProfile>) => {
      this.sim.setProfile(client.sessionId, msg);
      this.broadcastRoster();
    });
    this.onMessage(ClientMessage.SetReady, (client, msg: { ready?: boolean }) => {
      this.sim.setReady(client.sessionId, Boolean(msg?.ready));
      this.broadcastRoster();
    });
    this.onMessage(ClientMessage.StartGame, (client) => {
      if (this.sim.start(client.sessionId)) {
        this.broadcastRoster();
        this.startLoop();
      }
    });
    this.onMessage(ClientMessage.Command, (client, msg: ClientCommand) => {
      this.sim.enqueue(client.sessionId, msg);
    });
    // P4-7: shared 準備室 drawing canvas. Transient decoration only — no
    // canvas-state persistence, so a late joiner just sees a blank canvas
    // (accepted limitation, documented in Docs/P4-drawing_summary.md).
    this.onMessage(ClientMessage.Draw, (client, msg: { pts?: [number, number][] }) => {
      const pts = Array.isArray(msg?.pts) ? msg.pts : [];
      if (pts.length === 0) return;
      const profile = this.sim.getProfileBySession(client.sessionId);
      this.sim.recordDrawBatch(client.sessionId);
      this.broadcast(ServerMessage.Draw, {
        sessionId: client.sessionId,
        color: profile?.hatColor ?? '#e6194b',
        pts,
      });
    });
    this.onMessage(ClientMessage.ClearDrawing, (client) => {
      this.broadcast(ServerMessage.ClearDrawing, { sessionId: client.sessionId });
    });
    // P4-4: owner-only, once the round has ended -> back to the 準備室 lobby.
    this.onMessage(ClientMessage.Restart, (client) => {
      if (this.sim.restart(client.sessionId)) this.broadcastRoster();
    });
  }

  override onJoin(client: Client, options: { profile?: Partial<PlayerProfile> } = {}): void {
    const res = this.sim.join(client.sessionId, options.profile);
    client.send(ServerMessage.Welcome, {
      playerId: res.otterId,
      roomCode: this.sim.roomCode,
      spectator: res.spectator,
    });
    this.broadcastRoster();
  }

  override async onLeave(client: Client, consented?: boolean): Promise<void> {
    const wasPlaying = this.sim.phase === 'playing';
    this.sim.disconnect(client.sessionId);
    this.broadcastRoster();

    if (wasPlaying && !consented) {
      try {
        await this.allowReconnection(client, RECONNECT_SECONDS);
        this.sim.reconnect(client.sessionId);
      } catch {
        // Reconnection window elapsed; the sim removes the otter as it ticks.
      }
      this.broadcastRoster();
    }
  }

  private startLoop(): void {
    if (this.looping) return;
    this.looping = true;
    this.setSimulationInterval((dtMs) => {
      const snap = this.sim.step(dtMs);
      if (!snap) return;
      this.broadcast(ServerMessage.Snapshot, snap);
      if (this.sim.phase === 'ended') this.broadcastRoster();
    }, DEFAULT_TICK_MS);
  }

  private rosterPayload(): RosterPayload {
    return {
      roomCode: this.sim.roomCode,
      phase: this.sim.phase,
      players: this.sim.roster().map((p) => ({
        sessionId: p.sessionId,
        otterId: p.otterId,
        nickname: p.profile.nickname,
        hatColor: p.profile.hatColor,
        scarfColor: p.profile.scarfColor,
        ready: p.ready,
        connected: p.connected,
        spectator: p.spectator,
        owner: p.sessionId === this.sim.ownerId,
        doodleCount: this.sim.doodleCount(p.sessionId),
      })),
    };
  }

  private broadcastRoster(): void {
    this.broadcast(ServerMessage.Roster, this.rosterPayload());
  }
}

/** Re-exported so a host can `throw new ServerError(...)` on bad options. */
export { ServerError };
