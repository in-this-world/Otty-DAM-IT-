/**
 * Real colyseus.js transport (P3-02/03). Untested glue — type-checked, thin.
 * No schema state: the server broadcasts `welcome` / `roster` / `snapshot` as
 * plain messages, so the transport just forwards every message type straight
 * through to the adapter's handlers.
 *
 * Room-code join relies on the server defining `filterBy(['roomCode'])`.
 */
import { Client, type Room } from 'colyseus.js';
import { type PlayerProfile } from './protocol';
import type { MessageHandler, NetTransport } from './transport';

export interface ConnectOptions {
  /** ws(s):// URL of the Colyseus server (e.g. import.meta.env.VITE_COLYSEUS_URL). */
  readonly url: string;
  readonly roomName?: string;
  /** Join/create a room with this 4-letter code (server filterBy roomCode). */
  readonly roomCode?: string;
  readonly profile?: Partial<PlayerProfile>;
}

/** Join (or create) the Colyseus `dam` room and return the live Room. */
export async function joinRoom(opts: ConnectOptions): Promise<Room> {
  const client = new Client(opts.url);
  const roomName = opts.roomName ?? 'dam';
  const joinOptions = {
    profile: opts.profile,
    ...(opts.roomCode ? { roomCode: opts.roomCode } : {}),
  };
  return client.joinOrCreate(roomName, joinOptions);
}

/** Wrap a joined room in the adapter's NetTransport. */
export function transportForRoom(room: Room): NetTransport {
  return new ColyseusTransport(room);
}

/** Convenience: join + wrap in one call. */
export async function connectColyseus(opts: ConnectOptions): Promise<NetTransport> {
  return transportForRoom(await joinRoom(opts));
}

class ColyseusTransport implements NetTransport {
  constructor(private readonly room: Room) {}

  onMessage(type: string, handler: MessageHandler): void {
    this.room.onMessage(type, (m) => handler(m));
  }

  send(type: string, message: unknown): void {
    void this.room.send(type, message);
  }

  onLeave(handler: () => void): void {
    this.room.onLeave(() => handler());
  }

  open(): void {
    // Nothing to do: messages flow as soon as their handlers are registered.
  }

  leave(): void {
    void this.room.leave(true);
  }
}
