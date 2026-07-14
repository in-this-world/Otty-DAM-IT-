/**
 * Real colyseus.js transport (P3-02). Untested glue — hosting is deferred —
 * but type-checked and kept thin. Wraps a joined Colyseus room in the
 * NetTransport the ColyseusAdapter expects.
 *
 * The `welcome` is synthesized from the first LobbySchema sync (room.sessionId
 * -> that player's otterId), sidestepping the classic join/handler race where
 * an onJoin-sent message can beat the client's onMessage registration.
 *
 * Room-code join relies on the server defining `filterBy(['roomCode'])` on the
 * `dam` room so joinOrCreate lands in the matching room (or makes it).
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

/** Connect to a Colyseus `dam` room and return a NetTransport for the adapter. */
export async function connectColyseus(opts: ConnectOptions): Promise<NetTransport> {
  const client = new Client(opts.url);
  const roomName = opts.roomName ?? 'dam';
  const joinOptions = {
    profile: opts.profile,
    ...(opts.roomCode ? { roomCode: opts.roomCode } : {}),
  };
  const room = await client.joinOrCreate(roomName, joinOptions);
  return new ColyseusTransport(room);
}

class ColyseusTransport implements NetTransport {
  private readonly handlers = new Map<string, MessageHandler[]>();
  private welcomed = false;

  constructor(private readonly room: Room) {}

  onMessage(type: string, handler: MessageHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    // Welcome is synthesized locally (see open()); everything else is a real
    // server message we forward straight through.
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
