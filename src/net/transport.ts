/**
 * Transport seam for the ColyseusAdapter (P3-02). The adapter talks to this
 * tiny interface, never to colyseus.js directly, so it unit-tests against a
 * deterministic in-process LoopbackTransport (a real RoomSimulation behind a
 * manual clock) and runs in production against a real Colyseus room.
 */
import type { TickScheduler } from '../core/adapter';
import {
  ClientMessage,
  ServerMessage,
  type ClientCommand,
  type PlayerProfile,
} from './protocol';
import { RoomSimulation } from './room-sim';

export type MessageHandler = (message: unknown) => void;

export interface NetTransport {
  /** Subscribe to a server->client channel (welcome, snapshot, error). */
  onMessage(type: string, handler: MessageHandler): void;
  /** Send a client->server message (cmd, profile, ready, start). */
  send(type: string, message: unknown): void;
  /** Notified when the connection ends. */
  onLeave(handler: () => void): void;
  /** Begin the session: deliver `welcome`, then start the snapshot feed. */
  open(): void;
  /** Consented leave. */
  leave(): void;
}

export interface LoopbackOptions {
  readonly sessionId?: string;
  readonly profile?: Partial<PlayerProfile>;
  /** Drives server ticks; ManualScheduler in tests, IntervalScheduler in dev. */
  readonly serverScheduler: TickScheduler;
  /** Auto-start the round on open() (skip the lobby handshake) for quick play. */
  readonly autoStart?: boolean;
}

/**
 * In-process transport that runs an authoritative RoomSimulation locally —
 * "multiplayer with one machine". Invaluable for tests and for a hosting-free
 * local dev mode: exactly the same client code path as the networked game.
 */
export class LoopbackTransport implements NetTransport {
  private readonly handlers = new Map<string, MessageHandler[]>();
  private readonly leaveHandlers: (() => void)[] = [];
  private readonly sessionId: string;
  private opened = false;

  constructor(
    private readonly sim: RoomSimulation,
    private readonly opts: LoopbackOptions,
  ) {
    this.sessionId = opts.sessionId ?? 'local';
  }

  onMessage(type: string, handler: MessageHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  onLeave(handler: () => void): void {
    this.leaveHandlers.push(handler);
  }

  private emit(type: string, message: unknown): void {
    for (const h of this.handlers.get(type) ?? []) h(message);
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;

    const join = this.sim.join(this.sessionId, this.opts.profile);
    this.emit(ServerMessage.Welcome, {
      playerId: join.otterId,
      roomCode: this.sim.roomCode,
      spectator: join.spectator,
    });
    if (this.opts.autoStart) this.sim.start(this.sessionId);

    this.opts.serverScheduler.start((dtMs) => {
      const snap = this.sim.step(dtMs);
      if (snap) this.emit(ServerMessage.Snapshot, snap);
    });
  }

  send(type: string, message: unknown): void {
    switch (type) {
      case ClientMessage.Command:
        this.sim.enqueue(this.sessionId, message as ClientCommand);
        break;
      case ClientMessage.SetProfile:
        this.sim.setProfile(this.sessionId, message as Partial<PlayerProfile>);
        break;
      case ClientMessage.SetReady:
        this.sim.setReady(this.sessionId, Boolean((message as { ready?: boolean }).ready));
        break;
      case ClientMessage.StartGame:
        this.sim.start(this.sessionId);
        break;
      case ClientMessage.Restart:
        this.sim.restart(this.sessionId);
        break;
      default:
        break;
    }
  }

  leave(): void {
    this.opts.serverScheduler.stop();
    this.sim.disconnect(this.sessionId);
    for (const h of this.leaveHandlers) h();
  }
}
