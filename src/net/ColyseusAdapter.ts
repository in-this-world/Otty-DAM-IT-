/**
 * ColyseusAdapter (P3-02): a GameAdapter whose authority lives on the server.
 * The Phaser layer is unchanged — it still just calls sendCommand / onState /
 * onEvents (MASTER_PLAN §5.2 lane E). Under the hood:
 *
 *   - client->server: sendCommand relays the bare command; the server stamps
 *     the authoritative playerId (anti-cheat).
 *   - server->client: `snapshot` messages feed a SnapshotBuffer.
 *   - a render loop (60 fps) publishes a smoothed view each frame: REMOTE
 *     otters interpolated ~80 ms in the past, the LOCAL otter dead-reckoned to
 *     `now` from its last authoritative pose + current input intent, so local
 *     movement feels instant while staying server-authoritative.
 *
 * The transport is injected, so this whole class unit-tests against an
 * in-process RoomSimulation (LoopbackTransport) with manual clocks.
 */
import {
  IntervalScheduler,
  type GameAdapter,
  type TickScheduler,
  type Unsubscribe,
} from '../core/adapter';
import { effectiveSpeedPerSec } from '../core/items';
import type { Command, Direction, GameEvent, GameState, OtterState } from '../core/types';
import { extrapolateOtter, SnapshotBuffer } from './interpolation';
import {
  ClientMessage,
  ServerMessage,
  type ClientCommand,
  type SnapshotPayload,
  type WelcomePayload,
} from './protocol';
import type { NetTransport } from './transport';

const DIR_VECTORS: Readonly<Record<Direction, { x: number; y: number }>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** ~60 fps view refresh; interpolation trails real time by ~1.5 server ticks. */
export const DEFAULT_RENDER_MS = 16;
export const DEFAULT_INTERP_DELAY_MS = 80;

export interface ColyseusAdapterOptions {
  /** Drives the client view refresh. Manual in tests, interval in the browser. */
  readonly renderScheduler?: TickScheduler;
  readonly interpolationDelayMs?: number;
  /** Disable local prediction (render raw authoritative). Default: predict. */
  readonly predict?: boolean;
  /** Injectable clock start (tests). Defaults to 0 and advances by render dt. */
  readonly startNowMs?: number;
}

export class ColyseusAdapter implements GameAdapter {
  private readonly buffer: SnapshotBuffer;
  private readonly renderScheduler: TickScheduler;
  private readonly predict: boolean;
  private readonly stateSubs = new Set<(s: GameState) => void>();
  private readonly eventSubs = new Set<(e: readonly GameEvent[]) => void>();

  private nowMs: number;
  private latestAt = 0;
  private lastView: GameState | null = null;
  private _localPlayerId: string | null = null;
  private _spectator = false;
  private _connected = false;
  /** Current movement intent for local prediction; null = follow server vel. */
  private intent: { readonly dir: Direction } | { readonly stop: true } | null = null;
  private running = false;

  constructor(
    private readonly transport: NetTransport,
    opts: ColyseusAdapterOptions = {},
  ) {
    this.buffer = new SnapshotBuffer(opts.interpolationDelayMs ?? DEFAULT_INTERP_DELAY_MS);
    this.renderScheduler = opts.renderScheduler ?? new IntervalScheduler(DEFAULT_RENDER_MS);
    this.predict = opts.predict ?? true;
    this.nowMs = opts.startNowMs ?? 0;

    this.transport.onMessage(ServerMessage.Welcome, (msg) => {
      const w = msg as WelcomePayload;
      this._localPlayerId = w.playerId;
      this._spectator = w.spectator;
      this._connected = true;
    });
    this.transport.onMessage(ServerMessage.Snapshot, (msg) => {
      const { state, events } = msg as SnapshotPayload;
      this.buffer.push(state, this.nowMs);
      this.latestAt = this.nowMs;
      if (events.length > 0) for (const cb of this.eventSubs) cb(events);
    });
    this.transport.onLeave(() => {
      this._connected = false;
    });
  }

  get localPlayerId(): string | null {
    return this._localPlayerId;
  }

  get spectator(): boolean {
    return this._spectator;
  }

  get connected(): boolean {
    return this._connected;
  }

  sendCommand(command: Command): void {
    if (command.type === 'move') this.intent = { dir: command.dir };
    else if (command.type === 'stop') this.intent = { stop: true };
    // Strip the playerId: the server stamps the authoritative one.
    const { playerId: _pid, ...bare } = command;
    void _pid;
    this.transport.send(ClientMessage.Command, bare as ClientCommand);
  }

  onState(callback: (state: GameState) => void): Unsubscribe {
    this.stateSubs.add(callback);
    return () => this.stateSubs.delete(callback);
  }

  onEvents(callback: (events: readonly GameEvent[]) => void): Unsubscribe {
    this.eventSubs.add(callback);
    return () => this.eventSubs.delete(callback);
  }

  getState(): GameState {
    const s = this.lastView ?? this.buffer.latest;
    if (!s) throw new Error('ColyseusAdapter: no snapshot received yet');
    return s;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.transport.open();
    this.renderScheduler.start((dtMs) => this.render(dtMs));
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.renderScheduler.stop();
    this.transport.leave();
  }

  /** Compose + publish the smoothed client view for this frame. */
  private render(dtMs: number): void {
    this.nowMs += dtMs;
    const base = this.buffer.sample(this.nowMs);
    if (!base) return;

    let view = base;
    const local = this._localPlayerId;
    if (this.predict && local && base.otters[local]) {
      const latest = this.buffer.latest ?? base;
      const authoritative = latest.otters[local] ?? base.otters[local]!;
      const predicted = extrapolateOtter(
        this.applyIntent(authoritative),
        latest.world,
        this.nowMs - this.latestAt,
      );
      view = { ...base, otters: { ...base.otters, [local]: predicted } };
    }

    this.lastView = view;
    for (const cb of this.stateSubs) cb(view);
  }

  /** Fold the latest local input intent into an otter's velocity (client-side). */
  private applyIntent(otter: OtterState): OtterState {
    if (!this.intent || otter.stunnedMs > 0) return otter;
    if ('stop' in this.intent) {
      if (otter.vel.x === 0 && otter.vel.y === 0) return otter;
      return { ...otter, vel: { x: 0, y: 0 }, action: otter.carrying !== null ? 'carry' : 'idle' };
    }
    const v = DIR_VECTORS[this.intent.dir];
    const speed = effectiveSpeedPerSec(otter);
    return {
      ...otter,
      facing: this.intent.dir,
      vel: { x: v.x * speed, y: v.y * speed },
      action: otter.carrying !== null ? 'carry' : 'walk',
    };
  }
}
