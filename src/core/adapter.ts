/**
 * GameAdapter: the seam between the pure core and everything else.
 *
 * The Phaser layer (P1-05+) talks ONLY to this interface. In Phase 3 a
 * ColyseusAdapter implements the same interface and the render layer does
 * not change (MASTER_PLAN §5.2 lane E).
 */
import { createInitialState, type GameConfig } from './state';
import { defaultSystems, reduce, type System } from './tick';
import type { Command, GameEvent, GameState } from './types';

export type Unsubscribe = () => void;

export interface GameAdapter {
  /** Enqueue player intent; applied on the next tick. */
  sendCommand(command: Command): void;
  /** Subscribe to state snapshots (one per tick). Returns unsubscribe. */
  onState(callback: (state: GameState) => void): Unsubscribe;
  /** Subscribe to per-tick event batches. Returns unsubscribe. */
  onEvents(callback: (events: readonly GameEvent[]) => void): Unsubscribe;
  /** Latest snapshot (read-only; also feeds window.__otty for E2E asserts). */
  getState(): GameState;
  start(): void;
  stop(): void;
}

/**
 * Clock abstraction so unit tests never depend on real timers:
 * inject a ManualScheduler and drive ticks explicitly.
 */
export interface TickScheduler {
  start(onTick: (dtMs: number) => void): void;
  stop(): void;
}

/** Test/fake clock: call advance(dtMs) to run exactly one tick. */
export class ManualScheduler implements TickScheduler {
  private onTick: ((dtMs: number) => void) | null = null;

  start(onTick: (dtMs: number) => void): void {
    this.onTick = onTick;
  }

  stop(): void {
    this.onTick = null;
  }

  advance(dtMs: number): void {
    this.onTick?.(dtMs);
  }
}

/** Real clock for the browser: fixed timestep via setInterval. */
export class IntervalScheduler implements TickScheduler {
  private handle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly intervalMs: number) {}

  start(onTick: (dtMs: number) => void): void {
    if (this.handle !== null) return;
    this.handle = setInterval(() => onTick(this.intervalMs), this.intervalMs);
  }

  stop(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }
}

/** 20 Hz — matches the planned Colyseus server tick rate (MASTER_PLAN §2). */
export const DEFAULT_TICK_MS = 50;

export interface LocalAdapterOptions {
  readonly scheduler?: TickScheduler;
  readonly systems?: readonly System[];
}

/** Single-machine implementation: runs the pure reduce loop locally. */
export class LocalAdapter implements GameAdapter {
  private state: GameState;
  private queue: Command[] = [];
  private readonly stateSubscribers = new Set<(state: GameState) => void>();
  private readonly eventSubscribers = new Set<(events: readonly GameEvent[]) => void>();
  private readonly scheduler: TickScheduler;
  private readonly systems: readonly System[];
  private running = false;

  constructor(config: GameConfig, options: LocalAdapterOptions = {}) {
    this.state = createInitialState(config);
    this.scheduler = options.scheduler ?? new IntervalScheduler(DEFAULT_TICK_MS);
    this.systems = options.systems ?? defaultSystems;
  }

  sendCommand(command: Command): void {
    this.queue.push(command);
  }

  onState(callback: (state: GameState) => void): Unsubscribe {
    this.stateSubscribers.add(callback);
    return () => {
      this.stateSubscribers.delete(callback);
    };
  }

  onEvents(callback: (events: readonly GameEvent[]) => void): Unsubscribe {
    this.eventSubscribers.add(callback);
    return () => {
      this.eventSubscribers.delete(callback);
    };
  }

  getState(): GameState {
    return this.state;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduler.start((dtMs) => this.step(dtMs));
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.scheduler.stop();
  }

  private step(dtMs: number): void {
    const commands = this.queue;
    this.queue = [];
    const { state, events } = reduce(this.state, commands, dtMs, this.systems);
    this.state = state;
    for (const callback of this.stateSubscribers) callback(state);
    if (events.length > 0) {
      for (const callback of this.eventSubscribers) callback(events);
    }
  }
}
