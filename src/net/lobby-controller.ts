/**
 * LobbyController (P3-03): the pure connection-state machine behind the
 * 大廳/準備室 UX. It validates room codes, parses `#/r/ABCD` deep links, and
 * turns network events (connecting / welcome / error / disconnect / reconnect)
 * into a { state, message, ... } view the DOM lobby renders. No Colyseus, no
 * DOM — fully unit-testable; the actual overlay just calls these methods.
 */
import {
  isValidRoomCode,
  normalizeRoomCode,
  NET_ERROR_MESSAGES,
  parseJoinLink,
  type ConnectionState,
  type NetErrorCode,
  type WelcomePayload,
} from './protocol';

export interface LobbyView {
  readonly state: ConnectionState;
  /** zh-TW status/error copy for the connection banner. */
  readonly message: string;
  readonly roomCode: string | null;
  readonly localPlayerId: string | null;
  readonly spectator: boolean;
}

const STATUS_MESSAGE: Partial<Record<ConnectionState, string>> = {
  idle: '',
  connecting: '連線中…',
  reconnecting: NET_ERROR_MESSAGES.CONNECTION_LOST,
  disconnected: '連線已中斷',
};

export interface ValidateResult {
  readonly ok: boolean;
  readonly code?: string;
  readonly error?: NetErrorCode;
}

export class LobbyController {
  private _state: ConnectionState = 'idle';
  private _message = '';
  private _roomCode: string | null = null;
  private _localPlayerId: string | null = null;
  private _spectator = false;

  /** Pull a room code out of a deep link (`location.hash`), or null. */
  static codeFromLocation(hashOrPath: string): string | null {
    return parseJoinLink(hashOrPath);
  }

  /** Validate + normalize a typed/pasted room code before connecting. */
  validateJoin(input: string): ValidateResult {
    const code = normalizeRoomCode(input);
    if (!isValidRoomCode(code)) return { ok: false, error: 'INVALID_CODE' };
    return { ok: true, code };
  }

  /** Enter the connecting state (guards against double-connects). */
  beginConnect(roomCode: string | null): boolean {
    if (this._state === 'connecting' || this._state === 'connected') return false;
    this._state = 'connecting';
    this._message = STATUS_MESSAGE.connecting!;
    this._roomCode = roomCode;
    return true;
  }

  onWelcome(payload: WelcomePayload): void {
    this._state = 'connected';
    this._roomCode = payload.roomCode || this._roomCode;
    this._localPlayerId = payload.playerId;
    this._spectator = payload.spectator;
    this._message = payload.spectator ? '觀戰中' : '已連線';
  }

  onError(code: NetErrorCode): void {
    this._state = 'error';
    this._message = NET_ERROR_MESSAGES[code];
  }

  /** Connection dropped mid-game: show the reconnecting banner. */
  onDisconnect(): void {
    this._state = 'reconnecting';
    this._message = STATUS_MESSAGE.reconnecting!;
  }

  onReconnected(): void {
    this._state = 'connected';
    this._message = this._spectator ? '觀戰中' : '已連線';
  }

  onReconnectFailed(): void {
    this._state = 'disconnected';
    this._message = STATUS_MESSAGE.disconnected!;
  }

  get state(): ConnectionState {
    return this._state;
  }

  get localPlayerId(): string | null {
    return this._localPlayerId;
  }

  get spectator(): boolean {
    return this._spectator;
  }

  view(): LobbyView {
    return {
      state: this._state,
      message: this._message,
      roomCode: this._roomCode,
      localPlayerId: this._localPlayerId,
      spectator: this._spectator,
    };
  }
}
