/**
 * Real colyseus.js transport (P3-02/03). Untested glue — hosting is deferred —
 * but type-checked and thin. `joinRoom` gets a live room (used by the lobby to
 * read the synced roster); `transportForRoom` wraps it in the NetTransport the
 * ColyseusAdapter drives once play begins.
 *
 * The `welcome` is synthesized from the first LobbySchema sync (room.sessionId
 * -> that player's otterId), sidestepping the join/handler race where an
 * onJoin-sent message can beat the client's onMessage registration.
 *
 * Room-code join relies on the server defining `filterBy(['roomCode'])`.
 */
import { Client, type Room } from 'colyseus.js';
import { ServerMessage, type PlayerProfile, type WelcomePayload } from './protocol';
import type { MessageHandler, NetTransport } from './transport';

export interface ConnectOptions {
  /** ws(s):// URL of the Colyseus server (e.g. import.meta.env.VITE_COLYSEUS_URL). */
  readonly url: string;
  readonly roomName?: string;
  /** Join/create a room with this 4-letter code (server filterBy roomCode). */
  readonly roomCode?: string;
  readonly profile?: Partial<PlayerProfile>;
}

interface LobbyLike {
  roomCode?: string;
  players: { get(id: string): { otterId?: string; spectator?: boolean } | undefined };
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

/** Convenience: join + wrap in one call (used when no lobby UI is needed). */
export async function connectColyseus(opts: ConnectOptions): Promise<NetTransport> {
  return transportForRoom(await joinRoom(opts));
}

class ColyseusTransport implements NetTransport {
  private readonly handlers = new Map<string, MessageHandler[]>();
  private welcomed = false;

  constructor(private readonly room: Room) {}

  onMessage(type: string, handler: MessageHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    if (type !== ServerMessage.Welcome) {
      this.room.onMessage(type, (m) => handler(m));
    }
  }

  send(type: string, message: unknown): void {
    void this.room.send(type, message);
  }

  onLeave(handler: () => void): void {
    this.room.onLeave(() => handler());
  }

  open(): void {
    const emitWelcome = (): void => {
      if (this.welcomed) return;
      const state = this.room.state as unknown as LobbyLike | undefined;
      const me = state?.players?.get(this.room.sessionId);
      if (!me) return;
      this.welcomed = true;
      const payload: WelcomePayload = {
        playerId: me.otterId && me.otterId.length > 0 ? me.otterId : null,
        roomCode: state?.roomCode ?? '',
        spectator: Boolean(me.spectator),
      };
      for (const h of this.handlers.get(ServerMessage.Welcome) ?? []) h(payload);
    };
    this.room.onStateChange(() => emitWelcome());
    emitWelcome();
  }

  leave(): void {
    void this.room.leave(true);
  }
}
