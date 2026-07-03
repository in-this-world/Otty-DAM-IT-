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

/** Wearable headgear (P2-01 cone; P2-04 eagle checks this for immunity). */
export type HatType = 'cone';

/** Why an otter got stunned (drives distinct SFX/anim in the game layer). */
export type StunCause = 'thrownFish' | 'pit';

/** One value per spritesheet action (MASTER_PLAN §3.1). */
export type OtterAction = 'idle' | 'walk' | 'carry' | 'poke' | 'eat' | 'float' | 'build';

export interface OtterState {
  readonly id: string;
  readonly pos: Vec2;
  readonly facing: Direction;
  /** Current velocity in world units/sec (P1-01); {0,0} when standing. */
  readonly vel: Vec2;
  readonly action: OtterAction;
  /** Item type in paws, or null when empty-handed (P1-02). */
  readonly carrying: ItemType | null;
  /** Movement speed in world units per second (used by P1-01 movement). */
  readonly speedPerSec: number;
  /** Remaining stun after being poked / eagle-grabbed, in ms (P2). */
  readonly stunnedMs: number;
  /** Remaining fish speed-boost, in ms (P2-01). While > 0, speed x1.5. */
  readonly speedBoostMs: number;
  /** Headgear worn, or null. Cones block the eagle grab (P2-04). */
  readonly hat: HatType | null;
  /** Set by a valid build command; consumed by the dam system each tick (P1-03). */
  readonly wantsBuild: boolean;
  /** Personal contribution (dam progress added), used for flood settlement. */
  readonly score: number;
}

export interface ItemState {
  readonly id: string;
  readonly type: ItemType;
  readonly pos: Vec2;
  /** Otter id holding this item, or null when it lies on the ground. */
  readonly heldBy: string | null;
}

/**
 * A hole left behind by the dig command (P2-01). The digger gets a short
 * grace period; anyone else (or the digger, once grace expires) standing
 * within PIT_RADIUS falls in, gets stunned, and the pit fills itself.
 */
export interface PitState {
  readonly id: string;
  readonly pos: Vec2;
  /** Otter that dug the pit; immune while `diggerImmuneMs` > 0. */
  readonly diggerId: string;
  /** Remaining digger grace period in ms (decays per tick). */
  readonly diggerImmuneMs: number;
}

export type GamePhase = 'lobby' | 'playing' | 'won' | 'lost';

export interface DamState {
  /** Current build progress (same unit as `required`). */
  readonly progress: number;
  /** Progress needed to win; scales with player count (P1-03). */
  readonly required: number;
  /** Dam build site location; build commands must be issued within range. */
  readonly site: Vec2;
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
  /** World bounds; movement clamps positions to this rect (P1-01). */
  readonly world: { readonly width: number; readonly height: number };
  readonly items: Readonly<Record<string, ItemState>>;
  /** Open pits left by digging (P2-01); filled when someone falls in. */
  readonly pits: readonly PitState[];
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
  | (CommandBase & { readonly type: 'throwItem' })
  | (CommandBase & { readonly type: 'dig' })
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
  | { readonly type: 'itemEaten'; readonly playerId: string; readonly itemId: string; readonly itemType: ItemType }
  | {
      readonly type: 'itemThrown';
      readonly playerId: string;
      readonly itemId: string;
      readonly itemType: ItemType;
      readonly from: Vec2;
      readonly to: Vec2;
    }
  | {
      readonly type: 'otterStunned';
      readonly playerId: string;
      readonly durationMs: number;
      readonly cause: StunCause;
    }
  | { readonly type: 'hatWorn'; readonly playerId: string; readonly hat: HatType }
  | { readonly type: 'hatKnockedOff'; readonly playerId: string; readonly itemId: string }
  | { readonly type: 'dugDirt'; readonly playerId: string; readonly itemId: string; readonly pos: Vec2 }
  | { readonly type: 'pitCreated'; readonly pitId: string; readonly pos: Vec2 }
  | { readonly type: 'pitFilled'; readonly pitId: string; readonly playerId: string }
  | { readonly type: 'buildAttempted'; readonly playerId: string }
  | { readonly type: 'damProgressed'; readonly playerId: string; readonly amount: number; readonly progress: number }
  | { readonly type: 'gameWon'; readonly tick: number; readonly scores: Readonly<Record<string, number>> }
  | { readonly type: 'gameLost'; readonly tick: number; readonly scores: Readonly<Record<string, number>> }
  | { readonly type: 'tickCompleted'; readonly tick: number };

export type GameEventType = GameEvent['type'];
