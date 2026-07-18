/**
 * Network protocol shared by the Colyseus server (P3-01) and the
 * ColyseusAdapter client (P3-02). PURE: zero Colyseus/Phaser imports, so it
 * type-checks under Vitest and both the client and server bundle it.
 *
 * Design (MASTER_PLAN §2, P3 lane E): the server is authoritative and runs
 * the same pure `reduce` loop as LocalAdapter at 20 Hz. Lobby/roster data
 * rides Colyseus's built-in schema sync (see server/schema.ts); the fast
 * per-tick game snapshot travels as a `snapshot` message (full serializable
 * GameState + the tick's events). One source of truth, no schema divergence.
 */
import type { Command, GameEvent, GameState } from '../core/types';

/** Join links look like `#/r/ABCD` — 4 unambiguous uppercase letters. */
export const ROOM_CODE_LENGTH = 4;

/**
 * Alphabet excludes I and O (look like 1/0) so spoken/typed codes are
 * unambiguous. 24 letters ^ 4 = 331,776 codes — ample for a party game.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Deterministic 4-letter code from a numeric seed (mulberry-friendly). */
export function roomCodeFromSeed(seed: number): string {
  let n = seed >>> 0;
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[n % ROOM_CODE_ALPHABET.length];
    n = Math.floor(n / ROOM_CODE_ALPHABET.length);
    // Reseed cheaply so later chars aren't all-zero for small seeds.
    if (n === 0) n = (seed >>> 0) + i + 1;
  }
  return code;
}

/**
 * A fresh random room code, owned by the CLIENT. The host passes this as the
 * `roomCode` create option so Colyseus `filterBy(['roomCode'])` has a value a
 * joiner (who passes the same code) can match — otherwise a server-invented
 * code is never reachable and every join spins up a separate empty room.
 */
export function randomRoomCode(rand: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Normalize user input (`" r/abcd "`, `"abcd"`) to a bare uppercase code. */
export function normalizeRoomCode(raw: string): string {
  const m = raw.trim().toUpperCase().match(/[A-Z]{1,}$/);
  const tail = m ? m[0] : '';
  return tail.slice(-ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** Build the shareable join path for a room. */
export function joinLink(code: string): string {
  return `#/r/${code}`;
}

/** Parse a room code out of a URL hash/path, or null if none present. */
export function parseJoinLink(hashOrPath: string): string | null {
  const m = hashOrPath.toUpperCase().match(/R\/([A-Z]{4})/);
  return m && isValidRoomCode(m[1]!) ? m[1]! : null;
}

/* ------------------------------------------------------------------ */
/* Player identity + personalization (P3-05).                          */

/** Palette for hats/scarves in the 準備室. Kept small + colour-blind safe. */
export const PLAYER_COLORS = [
  '#e6194b', // red
  '#3cb44b', // green
  '#4363d8', // blue
  '#f58231', // orange
  '#911eb4', // purple
  '#42d4f4', // cyan
  '#f032e6', // magenta
  '#ffe119', // yellow
  '#9a6324', // brown
  '#000075', // navy
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

export const DEFAULT_NICKNAME = '水獺';
export const MAX_NICKNAME_LENGTH = 12;

/** Personalization chosen in the 準備室; persisted client-side (localStorage). */
export interface PlayerProfile {
  readonly nickname: string;
  readonly hatColor: string;
  readonly scarfColor: string;
}

export function defaultProfile(): PlayerProfile {
  return { nickname: DEFAULT_NICKNAME, hatColor: PLAYER_COLORS[2], scarfColor: PLAYER_COLORS[1] };
}

/** Clamp/scrub an incoming profile so the server never trusts client strings. */
export function sanitizeProfile(p: Partial<PlayerProfile> | undefined): PlayerProfile {
  const base = defaultProfile();
  const nickname = (p?.nickname ?? base.nickname).toString().trim().slice(0, MAX_NICKNAME_LENGTH);
  const pick = (c: string | undefined, fallback: string): string =>
    typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
  return {
    nickname: nickname.length > 0 ? nickname : base.nickname,
    hatColor: pick(p?.hatColor, base.hatColor),
    scarfColor: pick(p?.scarfColor, base.scarfColor),
  };
}

/* ------------------------------------------------------------------ */
/* Connection-state UX + error codes (P3-03).                          */

/** Reconnection grace window in seconds (bridged to Colyseus allowReconnection). */
export const RECONNECT_SECONDS = 30;

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type NetErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'INVALID_CODE'
  | 'ROOM_FULL'
  | 'NAME_REQUIRED'
  | 'ALREADY_STARTED'
  | 'CONNECTION_LOST'
  | 'INTERNAL';

/**
 * Human-facing (zh-TW) copy for each error code, for the connection UX.
 *
 * P4-0 decision: NOT routed through src/i18n.ts `t()`. This module is
 * imported by both the client and the Colyseus server (see the file header)
 * and must stay Vitest/pure with zero client-only globals; `i18n.ts` reads
 * localStorage/navigator (guarded, but still a client-shaped dependency) and
 * importing it here would couple a shared protocol file to client state.
 * If/when server-side error copy needs localization, prefer sending
 * `NetErrorCode` to the client and letting the client map code -> `t()`
 * string itself, rather than importing i18n into this shared module.
 */
export const NET_ERROR_MESSAGES: Readonly<Record<NetErrorCode, string>> = {
  ROOM_NOT_FOUND: '找不到房間,請確認房號',
  INVALID_CODE: '房號格式錯誤(需 4 個字母)',
  ROOM_FULL: '房間已滿(最多 10 人)',
  NAME_REQUIRED: '請先輸入暱稱',
  ALREADY_STARTED: '遊戲已開始,你將以觀戰身分加入',
  CONNECTION_LOST: '連線中斷,嘗試重新連線中…',
  INTERNAL: '伺服器發生錯誤,請稍後再試',
};

/* ------------------------------------------------------------------ */
/* Message channels. Client->server intents and server->client feeds.  */

/** Client -> server message names. */
export const ClientMessage = {
  Command: 'cmd',
  SetProfile: 'profile',
  SetReady: 'ready',
  StartGame: 'start',
  /** P4-7: batched points for the shared 準備室 drawing canvas. */
  Draw: 'draw',
  /** P4-7: clear only the sender's own strokes on everyone's canvas. */
  ClearDrawing: 'clearDrawing',
  /** P4-4: owner-only, once the round has ended -> back to the 準備室 lobby. */
  Restart: 'restart',
} as const;

/** Server -> client message names. */
export const ServerMessage = {
  /** Assigned identity on join (which otter this client controls). */
  Welcome: 'welcome',
  /** Low-frequency lobby roster + phase (replaces Colyseus schema sync). */
  Roster: 'roster',
  /** Full authoritative game snapshot for one tick (during play). */
  Snapshot: 'snapshot',
  /** An error the client should surface in the connection UX. */
  Error: 'error',
  /** P4-7: relayed stroke batch, stamped with sender + their hat colour. */
  Draw: 'draw',
  /** P4-7: relayed "erase this sessionId's strokes" broadcast. */
  ClearDrawing: 'clearDrawing',
} as const;

/** Payload: client sends a bare command (no playerId; server stamps it). */
export type ClientCommand = Omit<Command, 'playerId'>;

export interface WelcomePayload {
  /** The otter id this client controls, or null for a spectator. */
  readonly playerId: string | null;
  readonly roomCode: string;
  readonly spectator: boolean;
}

/** Full-state broadcast each tick during play (P3-01 20 Hz). */
export interface SnapshotPayload {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** One player row in the lobby roster (P3-03/05). */
export interface RosterEntry {
  readonly sessionId: string;
  readonly otterId: string | null;
  readonly nickname: string;
  readonly hatColor: string;
  readonly scarfColor: string;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly spectator: boolean;
  readonly owner: boolean;
  /**
   * P4-7: flushed draw-batch count for this session (RoomSimulation.
   * doodleCount). For P4-endgame's "most doodles" fallback title: read the
   * highest `doodleCount` across the final roster snapshot.
   */
  readonly doodleCount: number;
}

/** Broadcast whenever the roster or phase changes (message, not schema). */
export interface RosterPayload {
  readonly roomCode: string;
  readonly phase: 'lobby' | 'playing' | 'ended';
  readonly players: readonly RosterEntry[];
}

export interface ErrorPayload {
  readonly code: NetErrorCode;
  readonly message: string;
}

/* ------------------------------------------------------------------ */
/* Shared 準備室 drawing canvas (P4-7).                                 */
/* Transient lobby decoration: the server relays strokes but does NOT  */
/* persist canvas state. A late joiner sees a blank canvas — accepted  */
/* limitation, not a bug (see Docs/P4-drawing_summary.md).             */

/** Client -> server: a flushed batch of points from makeDrawBatch. */
export interface DrawMessage {
  readonly pts: readonly (readonly [number, number])[];
}

/**
 * Server -> client: a relayed stroke batch. `color` is stamped server-side
 * from the sender's profile.hatColor (never trusted from the client), and
 * `sessionId` tells recipients whose stroke this is so "clear only your own
 * marks" can target just that player's lines.
 */
export interface DrawBroadcast {
  readonly sessionId: string;
  readonly color: string;
  readonly pts: readonly (readonly [number, number])[];
}

/** Server -> client: erase this sessionId's strokes locally. */
export interface ClearDrawingBroadcast {
  readonly sessionId: string;
}
