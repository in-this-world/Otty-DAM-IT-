/**
 * Initial game state factory. Pure and deterministic: the same config
 * always yields a deep-equal GameState (asserted by unit tests), which is
 * what makes lockstep/local replay and later server authority possible.
 */
import { rngStep } from './rng';
import type { GamePhase, GameState, OtterState } from './types';

export interface GameConfig {
  /** Number of otters (players and, later, AI fill-ins). Clamped to 1..10. */
  readonly playerCount: number;
  /** RNG seed; drives spawn positions and all future randomness. */
  readonly seed: number;
  /** Round length in ms. Default 4 minutes (3-5 min party round). */
  readonly timerMs?: number;
  /**
   * Starting phase. Defaults to 'playing' so a local round starts
   * immediately; the lobby flow (P3) passes 'lobby' explicitly.
   */
  readonly phase?: GamePhase;
  /** Dam requirement scaling: required = playerCount * this (P1-03 may tune). */
  readonly damRequiredPerPlayer?: number;
  /** World bounds used for spawning (and P1-01 movement clamping). */
  readonly world?: { readonly width: number; readonly height: number };
}

export const DEFAULT_TIMER_MS = 240_000;
export const DEFAULT_DAM_REQUIRED_PER_PLAYER = 20;
export const DEFAULT_WORLD = { width: 1280, height: 720 } as const;
export const DEFAULT_OTTER_SPEED_PER_SEC = 200;
export const MAX_PLAYERS = 10;

export function createInitialState(config: GameConfig): GameState {
  const playerCount = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(config.playerCount)));
  const world = config.world ?? DEFAULT_WORLD;
  const damRequiredPerPlayer = config.damRequiredPerPlayer ?? DEFAULT_DAM_REQUIRED_PER_PLAYER;

  let seed = config.seed >>> 0;
  const otters: Record<string, OtterState> = {};
  for (let i = 1; i <= playerCount; i++) {
    const sx = rngStep(seed);
    const sy = rngStep(sx.nextSeed);
    seed = sy.nextSeed;
    const id = `otter-${i}`;
    otters[id] = {
      id,
      pos: { x: sx.value * world.width, y: sy.value * world.height },
      facing: 'down',
      action: 'idle',
      carrying: null,
      speedPerSec: DEFAULT_OTTER_SPEED_PER_SEC,
      stunnedMs: 0,
      score: 0,
    };
  }

  return {
    tick: 0,
    phase: config.phase ?? 'playing',
    timerMs: config.timerMs ?? DEFAULT_TIMER_MS,
    dam: { progress: 0, required: playerCount * damRequiredPerPlayer },
    otters,
    items: {}, // item spawning arrives with P1-02/P2 systems
    rngSeed: seed,
  };
}
