/**
 * Initial game state factory. Pure and deterministic: the same config
 * always yields a deep-equal GameState (asserted by unit tests), which is
 * what makes lockstep/local replay and later server authority possible.
 */
import { requiredProgress } from './dam';
import { rngStep } from './rng';
import type {
  GamePhase,
  GameState,
  HazardKind,
  HazardsState,
  HazardSpawn,
  ItemState,
  ItemType,
  OtterState,
  Rect,
  Vec2,
} from './types';

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
  /**
   * Explicit item placement (tests, scripted scenarios). When omitted,
   * items are scattered deterministically from the seed so a default
   * round is winnable: mostly branches, with a sprinkle of fish and
   * stones (P2-01; every 8th item is a fish, every 8th-offset-4 a stone).
   */
  readonly items?: readonly { readonly id: string; readonly type: ItemType; readonly pos: Vec2 }[];
  /** Water zones (P2-03). Otters inside float and wash off debuffs. */
  readonly water?: readonly Rect[];
  /**
   * Per-otter movement-speed override (world units/sec). Otters not listed
   * fall back to DEFAULT_OTTER_SPEED_PER_SEC. Lets the game slow AI otters
   * down so they don't zip around (P2-05 tuning).
   */
  readonly speedByOtter?: Readonly<Record<string, number>>;
  /**
   * Sudden-event hazards (P2-04 老鷹/熊). Omitted => no hazards (default; keeps
   * existing rounds/tests unchanged). `enabled` schedules a random 1-2 events;
   * `schedule` pins exact spawns (kind + ms elapsed into the round) for tests
   * and scripted scenarios.
   */
  readonly hazards?: {
    readonly enabled?: boolean;
    /** How many random events when `enabled` and no explicit schedule (1-2). */
    readonly count?: number;
    readonly schedule?: readonly { readonly kind: HazardKind; readonly atElapsedMs: number }[];
  };
}

export const DEFAULT_TIMER_MS = 240_000;
export const DEFAULT_DAM_REQUIRED_PER_PLAYER = 20;
export const DEFAULT_WORLD = { width: 1280, height: 720 } as const;
export const DEFAULT_OTTER_SPEED_PER_SEC = 200;
export const MAX_PLAYERS = 10;

/** Default scatter mix (P2-01): i%8==0 -> fish, i%8==4 -> stone, else branch. */
function defaultItemType(i: number): ItemType {
  if (i % 8 === 0) return 'fish';
  if (i % 8 === 4) return 'stone';
  return 'branch';
}

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
      vel: { x: 0, y: 0 },
      action: 'idle',
      carrying: null,
      speedPerSec: config.speedByOtter?.[id] ?? DEFAULT_OTTER_SPEED_PER_SEC,
      stunnedMs: 0,
      speedBoostMs: 0,
      invulnMs: 0,
      hat: null,
      wantsBuild: false,
      wantsSwim: false,
      actionMs: 0,
      buildingMs: 0,
      score: 0,
      floating: false,
      raftLinks: 0,
    };
  }

  const required = requiredProgress(playerCount, damRequiredPerPlayer);
  const damSite: Vec2 = { x: world.width / 2, y: 96 };

  const items: Record<string, ItemState> = {};
  if (config.items) {
    for (const it of config.items) {
      items[it.id] = { id: it.id, type: it.type, pos: it.pos, heldBy: null };
    }
  } else {
    // Default: scatter 2x the required progress in items so a round is
    // comfortably winnable; deterministic from the seed. Mostly branches,
    // plus a few fish (snacks/projectiles) and stones (heavy, 3 progress).
    const count = Math.ceil(required * 2);
    for (let i = 1; i <= count; i++) {
      const rx = rngStep(seed);
      const ry = rngStep(rx.nextSeed);
      seed = ry.nextSeed;
      const type = defaultItemType(i);
      const id = `${type}-${i}`;
      items[id] = {
        id,
        type,
        pos: { x: rx.value * world.width, y: world.height * 0.35 + ry.value * world.height * 0.6 },
        heldBy: null,
      };
    }
  }

  const timerMs = config.timerMs ?? DEFAULT_TIMER_MS;

  // P2-04: build the hazard schedule (deterministic from the seed).
  let hazards: HazardsState | undefined;
  if (config.hazards) {
    const spawns: HazardSpawn[] = [];
    if (config.hazards.schedule) {
      for (const sp of config.hazards.schedule) {
        spawns.push({ kind: sp.kind, atTimerMs: timerMs - sp.atElapsedMs });
      }
    } else if (config.hazards.enabled) {
      // Random 1-2 events in the middle 60% of the round; kinds from the seed.
      const rc = rngStep(seed);
      seed = rc.nextSeed;
      const count = Math.max(1, Math.min(4, config.hazards.count ?? (rc.value < 0.5 ? 1 : 2)));
      for (let i = 0; i < count; i++) {
        const rt = rngStep(seed);
        const rk = rngStep(rt.nextSeed);
        seed = rk.nextSeed;
        const atElapsedMs = Math.round(timerMs * (0.2 + 0.6 * rt.value));
        spawns.push({ kind: rk.value < 0.5 ? 'eagle' : 'bear', atTimerMs: timerMs - atElapsedMs });
      }
    }
    // Fire earliest-in-round first: descending atTimerMs.
    spawns.sort((a, b) => b.atTimerMs - a.atTimerMs);
    hazards = { eagle: null, bear: null, schedule: spawns };
  }

  return {
    tick: 0,
    phase: config.phase ?? 'playing',
    timerMs,
    dam: { progress: 0, required, site: damSite },
    otters,
    world: { width: world.width, height: world.height },
    items,
    pits: [],
    rngSeed: seed,
    water: config.water ?? [],
    ...(hazards ? { hazards } : {}),
  };
}
