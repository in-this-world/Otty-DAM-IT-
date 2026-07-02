/**
 * Foundational types for the pure game core (MASTER_PLAN §2.1).
 *
 * Everything in src/core/ is plain serializable data + pure functions:
 * zero Phaser imports (ESLint-enforced), so the same code can run under
 * Vitest today and inside a Colyseus server room in Phase 3.
 *
 * Pattern: Command (player intent) -> reduce -> new GameState + GameEvent[].
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Collectible/usable item kinds (P1-02 inventory, P2 item effects). */
export type ItemType = 'branch' | 'fish' | 'stone' | 'cone' | 'dirt';

/** One value per spritesheet action (MASTER_PLAN §3.1). */
export type OtterAction = 'idle' | 'walk' | 'carry' | 'poke' | 'eat' | 'float' | 'build';

export interface OtterState {
  readonly id: string;
  readonly pos: Vec2;
  readonly facing: Direction;
  readonly action: OtterAction;
  /** Item type in paws, or null when empty-handed (P1-02). */
  readonly carrying: ItemType | null;
  /** Movement speed in world units per second (used by P1-01 movement). */
  readonly speedPerSec: number;
  /** Remaining stun after being poked / eagle-grabbed, in ms (P2). */
  readonly stunnedMs: number;
  /** Personal contribution, used for flood settlement when the round is lost. */
  readonly score: number;
}

export interface ItemState {
  readonly id: string;
  readonly type: ItemType;
  readonly pos: Vec2;
  /** Otter id holding this item, or null when it lies on the ground. */
  readonly heldBy: string | null;
}

export type GamePhase = 'lobby' | 'playing' | 'won' | 'lost';

export interface DamState {
  /** Current build progress (same unit as `required`). */
  readonly progress: number;
  /** Progress needed to win; scales with player count (P1-03). */
  readonly required: number;
}

/**
 * Complete simulation state. Treated as immutable: `reduce` returns a new
 * object with structural sharing of unchanged branches.
 */
export interface GameState {
  readonly tick: number;
  readonly phase: GamePhase;
  /** Remaining round time in ms; P1-04 counts it down and triggers the flood. */
  readonly timerMs: number;
  readonly dam: DamState;
  readonly otters: Readonly<Record<string, OtterState>>;
  readonly items: Readonly<Record<string, ItemState>>;
  /** Current mulberry32 seed; advance only via rngStep to stay deterministic. */
  readonly rngSeed: number;
}

/* ------------------------------------------------------------------ */
/* Commands: per-player intent. Validated by the reducer, so a future  */
/* Colyseus server stays authoritative over cheating clients (P3).     */

interface CommandBase {
  readonly playerId: string;
}

export type Command =
  | (CommandBase & { readonly type: 'move'; readonly dir: Direction })
  | (CommandBase & { readonly type: 'stop' })
  | (CommandBase & { readonly type: 'pickUp'; readonly itemId?: string })
  | (CommandBase & { readonly type: 'drop' })
  | (CommandBase & { readonly type: 'useItem' })
  | (CommandBase & { readonly type: 'poke' })
  | (CommandBase & { readonly type: 'build' });

export type CommandType = Command['type'];

/* ------------------------------------------------------------------ */
/* Events: facts the reducer emitted this tick. The Phaser layer plays */
/* them back (animations, SFX); the net layer relays them (P3).        */

export type GameEvent =
  | {
      readonly type: 'commandRejected';
      readonly playerId: string;
      readonly command: CommandType | 'unknown';
      readonly reason: string;
    }
  | { readonly type: 'otterMoved'; readonly playerId: string; readonly dir: Direction }
  | { readonly type: 'otterStopped'; readonly playerId: string }
  | { readonly type: 'otterPoked'; readonly attackerId: string; readonly targetId: string | null }
  | { readonly type: 'itemSpawned'; readonly itemId: string; readonly itemType: ItemType; readonly pos: Vec2 }
  | { readonly type: 'itemPickedUp'; readonly playerId: string; readonly itemId: string; readonly itemType: ItemType }
  | { readonly type: 'itemDropped'; readonly playerId: string; readonly itemId: string; readonly itemType: ItemType }
  | { readonly type: 'itemUsed'; readonly playerId: string; readonly itemType: ItemType }
  | { readonly type: 'buildAttempted'; readonly playerId: string }
  | { readonly type: 'damProgressed'; readonly playerId: string; readonly amount: number; readonly progress: number }
  | { readonly type: 'gameWon'; readonly tick: number }
  | { readonly type: 'gameLost'; readonly tick: number }
  | { readonly type: 'tickCompleted'; readonly tick: number };

export type GameEventType = GameEvent['type'];
