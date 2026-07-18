/**
 * RoomSimulation — the authoritative game loop that a Colyseus room drives
 * (P3-01). PURE of Colyseus/Phaser: it owns a GameState and advances it with
 * the same `reduce` pipeline as LocalAdapter, plus multiplayer concerns the
 * single-player path never had:
 *
 *   - a roster (sessionId -> otter) with join/leave in the 準備室 lobby,
 *   - owner handoff when the host leaves,
 *   - mid-game spectators (join while playing => no otter),
 *   - disconnect handling: a 30 s reconnection window during which an AI
 *     drives the missing otter (planOtterCommands); on expiry the otter is
 *     removed and the dam requirement is recomputed (n^0.85), so a smaller
 *     team has a smaller wall to build.
 *
 * Everything here is deterministic and clock-injected, so it unit-tests
 * without a network or timers.
 */
import { planOtterCommands } from '../core/ai';
import { requiredProgress } from '../core/dam';
import {
  createInitialState,
  DEFAULT_DAM_REQUIRED_PER_PLAYER,
  MAX_PLAYERS,
  type GameConfig,
} from '../core/state';
import { defaultSystems, reduce, type System } from '../core/tick';
import type { Command, GameState, Rect } from '../core/types';
import {
  roomCodeFromSeed,
  sanitizeProfile,
  type PlayerProfile,
  type SnapshotPayload,
} from './protocol';

/** Grace window an otter keeps its slot after a disconnect (AI takes over). */
export const RECONNECT_WINDOW_MS = 30_000;

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export interface RoomPlayer {
  readonly sessionId: string;
  /** Controlled otter id, or null for a spectator (joined mid-game). */
  otterId: string | null;
  /** Monotonic join order; drives deterministic owner handoff + otter ids. */
  readonly joinSeq: number;
  profile: PlayerProfile;
  ready: boolean;
  connected: boolean;
  spectator: boolean;
  /** >0 while inside the reconnection window (AI drives the otter). */
  reconnectMsLeft: number;
}

export interface JoinResult {
  readonly otterId: string | null;
  readonly spectator: boolean;
}

export interface RoomSimulationOptions {
  readonly seed: number;
  readonly roomCode?: string;
  readonly timerMs?: number;
  readonly damRequiredPerPlayer?: number;
  readonly world?: { readonly width: number; readonly height: number };
  /** Water zones (P2-03) so float/swim + fish placement match the client. */
  readonly water?: readonly Rect[];
  readonly hazards?: GameConfig['hazards'];
  /** Injectable pipeline (tests may pass a subset). Defaults to core order. */
  readonly systems?: readonly System[];
  /** Injectable reconnection window (tests shorten it). */
  readonly reconnectWindowMs?: number;
}

export class RoomSimulation {
  readonly roomCode: string;
  private readonly seed: number;
  private readonly timerMs?: number;
  private readonly damRequiredPerPlayer: number;
  private readonly world?: { readonly width: number; readonly height: number };
  private readonly water?: readonly Rect[];
  private readonly hazards?: GameConfig['hazards'];
  private readonly systems: readonly System[];
  private readonly reconnectWindowMs: number;

  private _phase: RoomPhase = 'lobby';
  private _state: GameState | null = null;
  private readonly players = new Map<string, RoomPlayer>();
  /** P4-7: per-session flushed draw-batch count (see doodleCount()). */
  private readonly doodleCounts = new Map<string, number>();
  private _ownerId: string | null = null;
  private joinCounter = 0;
  private queue: Command[] = [];

  constructor(opts: RoomSimulationOptions) {
    this.seed = opts.seed >>> 0;
    this.roomCode = opts.roomCode ?? roomCodeFromSeed(this.seed);
    this.timerMs = opts.timerMs;
    this.damRequiredPerPlayer = opts.damRequiredPerPlayer ?? DEFAULT_DAM_REQUIRED_PER_PLAYER;
    this.world = opts.world;
    this.water = opts.water;
    this.hazards = opts.hazards;
    this.systems = opts.systems ?? defaultSystems;
    this.reconnectWindowMs = opts.reconnectWindowMs ?? RECONNECT_WINDOW_MS;
  }

  get phase(): RoomPhase {
    return this._phase;
  }

  get ownerId(): string | null {
    return this._ownerId;
  }

  get state(): GameState | null {
    return this._state;
  }

  /** Players sorted by join order (stable roster for lobby UI + otter ids). */
  roster(): RoomPlayer[] {
    return [...this.players.values()].sort((a, b) => a.joinSeq - b.joinSeq);
  }

  /** Count of otters currently controlled (human-connected or AI-covered). */
  private activeOtterCount(): number {
    return this._state ? Object.keys(this._state.otters).length : 0;
  }

  /**
   * Join the room. In the lobby a player claims the next otter slot (up to
   * MAX_PLAYERS); once the game is playing a newcomer becomes a spectator.
   * Returns null otterId for spectators.
   */
  join(sessionId: string, profile?: Partial<PlayerProfile>): JoinResult {
    const existing = this.players.get(sessionId);
    if (existing) {
      // Idempotent re-join (e.g. reconnect handshake) — treat as reconnect.
      this.reconnect(sessionId);
      return { otterId: existing.otterId, spectator: existing.spectator };
    }

    const seq = this.joinCounter++;
    const clean = sanitizeProfile(profile);

    const playingOrFull =
      this._phase !== 'lobby' || this.players.size >= MAX_PLAYERS;
    const spectator = playingOrFull;
    const otterId = spectator ? null : `otter-${seq + 1}`;

    const player: RoomPlayer = {
      sessionId,
      otterId,
      joinSeq: seq,
      profile: clean,
      ready: false,
      connected: true,
      spectator,
      reconnectMsLeft: 0,
    };
    this.players.set(sessionId, player);
    if (this._ownerId === null && !spectator) this._ownerId = sessionId;
    return { otterId, spectator };
  }

  setProfile(sessionId: string, profile: Partial<PlayerProfile>): void {
    const p = this.players.get(sessionId);
    if (p) p.profile = sanitizeProfile(profile);
  }

  setReady(sessionId: string, ready: boolean): void {
    const p = this.players.get(sessionId);
    if (p) p.ready = ready;
  }

  /**
   * P4-7: record one flushed draw-batch from a session (called by DamRoom
   * when it relays a ClientMessage.Draw). Tracked server-side so a later
   * "most doodles" fallback title can read a single authoritative count -
   * see doodleCount() and the `doodleCount` field on RosterEntry.
   */
  recordDrawBatch(sessionId: string): void {
    this.doodleCounts.set(sessionId, (this.doodleCounts.get(sessionId) ?? 0) + 1);
  }

  /** Flushed draw-batch count for a session; 0 if never drawn/unknown. */
  doodleCount(sessionId: string): number {
    return this.doodleCounts.get(sessionId) ?? 0;
  }

  getProfile(otterId: string): PlayerProfile | null {
    for (const p of this.players.values()) if (p.otterId === otterId) return p.profile;
    return null;
  }

  /**
   * P4-7: look up a player's profile by session id (not otter id) so the
   * server can stamp a Draw broadcast with the sender's own hatColor -
   * never trust a client-supplied color, else a player could spoof another
   * player's stroke color.
   */
  getProfileBySession(sessionId: string): PlayerProfile | null {
    return this.players.get(sessionId)?.profile ?? null;
  }

  /** True when every non-spectator player has readied (owner may start). */
  allReady(): boolean {
    const active = this.roster().filter((p) => !p.spectator);
    return active.length > 0 && active.every((p) => p.ready);
  }

  /**
   * Begin the round. Owner-gated when `bySessionId` is supplied. Snapshots
   * the current non-spectator roster into otter-1..N and builds the initial
   * GameState. No-op if already playing.
   */
  start(bySessionId?: string): boolean {
    if (this._phase !== 'lobby') return false;
    if (bySessionId !== undefined && bySessionId !== this._ownerId) return false;

    const active = this.roster().filter((p) => !p.spectator);
    if (active.length === 0) return false;

    // Re-key otters to a dense otter-1..N so createInitialState + AI agree.
    active.forEach((p, i) => {
      p.otterId = `otter-${i + 1}`;
    });

    this._state = createInitialState({
      playerCount: active.length,
      seed: this.seed,
      phase: 'playing',
      ...(this.timerMs !== undefined ? { timerMs: this.timerMs } : {}),
      damRequiredPerPlayer: this.damRequiredPerPlayer,
      ...(this.world ? { world: this.world } : {}),
      ...(this.water ? { water: this.water } : {}),
      ...(this.hazards ? { hazards: this.hazards } : {}),
      // P4-3: multiplayer rounds never spawn the eagle/bear hazards.
      isMultiplayer: true,
    });
    this._phase = 'playing';
    this.queue = [];
    return true;
  }

  /**
   * P4-4: owner-only, once the round has ended -> back to the 準備室 lobby.
   * No-op (returns false) unless the room is 'ended' AND `bySessionId` is
   * the current owner. On success: phase -> 'lobby', the finished GameState
   * is dropped, the command queue is cleared, and every roster player's
   * `ready` flag resets to false. This is NOT a re-join: connections,
   * profiles, colors, joinSeq, and otterId all survive untouched, so the
   * roster looks the same (minus readiness) when the 準備室 screen reappears.
   */
  restart(bySessionId: string): boolean {
    if (this._phase !== 'ended') return false;
    if (bySessionId !== this._ownerId) return false;

    this._phase = 'lobby';
    this._state = null;
    this.queue = [];
    for (const p of this.players.values()) p.ready = false;
    return true;
  }

  /**
   * Enqueue a player's command for the next tick. The server stamps the
   * authoritative playerId from the roster, so a client cannot forge one.
   * Ignores spectators and unmapped sessions.
   */
  enqueue(sessionId: string, command: Omit<Command, 'playerId'>): void {
    if (this._phase !== 'playing') return;
    const p = this.players.get(sessionId);
    if (!p || !p.otterId || p.spectator) return;
    this.queue.push({ ...command, playerId: p.otterId } as Command);
  }

  /** Mark a session disconnected; its otter enters the AI-covered window. */
  disconnect(sessionId: string): void {
    const p = this.players.get(sessionId);
    if (!p) return;
    p.connected = false;
    p.ready = false;
    if (this._phase === 'playing' && p.otterId && !p.spectator) {
      p.reconnectMsLeft = this.reconnectWindowMs;
    } else {
      // In the lobby (or a spectator) just leave outright.
      this.removePlayer(sessionId);
    }
    if (sessionId === this._ownerId) this.handoffOwner();
  }

  /** Restore control to a returning player if still within the window. */
  reconnect(sessionId: string): boolean {
    const p = this.players.get(sessionId);
    if (!p) return false;
    p.connected = true;
    p.reconnectMsLeft = 0;
    if (this._ownerId === null && !p.spectator) this._ownerId = sessionId;
    return true;
  }

  private removePlayer(sessionId: string): void {
    const p = this.players.get(sessionId);
    if (!p) return;
    this.players.delete(sessionId);
    if (this._state && p.otterId && this._state.otters[p.otterId]) {
      this.removeOtter(p.otterId);
    }
    if (sessionId === this._ownerId) this.handoffOwner();
  }

  /** Drop an otter from the live state and rescale the dam requirement. */
  private removeOtter(otterId: string): void {
    if (!this._state) return;
    const otters = { ...this._state.otters };
    delete otters[otterId];
    // Any items the otter carried fall where they stood.
    const items = { ...this._state.items };
    for (const id of Object.keys(items)) {
      if (items[id]!.heldBy === otterId) items[id] = { ...items[id]!, heldBy: null };
    }
    const count = Math.max(1, Object.keys(otters).length);
    const required = requiredProgress(count, this.damRequiredPerPlayer);
    this._state = {
      ...this._state,
      otters,
      items,
      dam: { ...this._state.dam, required },
    };
  }

  /** Pick the earliest-joined remaining non-spectator as the new owner. */
  private handoffOwner(): void {
    const next = this.roster().find((p) => !p.spectator);
    this._ownerId = next ? next.sessionId : null;
  }

  /**
   * Advance one server tick. Enqueues AI commands for any disconnected otter
   * still inside its reconnection window, decays those windows (removing the
   * otter when it lapses), runs the pure reduce, then clears the queue.
   * Returns the new snapshot, or null while in the lobby.
   */
  step(dtMs: number): SnapshotPayload | null {
    if (this._phase !== 'playing' || !this._state) return null;

    // AI drives disconnected otters; expire lapsed reconnection windows.
    for (const p of this.roster()) {
      if (p.connected || p.spectator || !p.otterId) continue;
      if (p.reconnectMsLeft > 0) {
        for (const cmd of planOtterCommands(this._state, p.otterId)) this.queue.push(cmd);
        p.reconnectMsLeft = Math.max(0, p.reconnectMsLeft - dtMs);
        if (p.reconnectMsLeft === 0) this.removePlayer(p.sessionId);
      }
    }

    const commands = this.queue;
    this.queue = [];
    const { state, events } = reduce(this._state, commands, dtMs, this.systems);
    this._state = state;
    if (state.phase === 'won' || state.phase === 'lost') this._phase = 'ended';
    return { state, events };
  }

  snapshot(): SnapshotPayload | null {
    return this._state ? { state: this._state, events: [] } : null;
  }
}
