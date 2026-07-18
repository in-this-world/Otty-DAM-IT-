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

/** Axis-aligned rectangle in world coordinates (P2-03 water zones). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Collectible/usable item kinds (P1-02 inventory, P2 item effects). */
export type ItemType = 'branch' | 'fish' | 'stone' | 'cone' | 'dirt' | 'mushroom';

/** Wearable headgear (P2-01 cone; P2-04 eagle checks this for immunity). */
export type HatType = 'cone';

/** Why an otter got stunned (drives distinct SFX/anim in the game layer). */
export type StunCause = 'thrownFish' | 'pit' | 'poke' | 'bear' | 'eagle';

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
  /** Remaining post-poke invulnerability, in ms (P2-02). While > 0, immune to pokes. */
  readonly invulnMs?: number;
  /** Headgear worn, or null. Cones block the eagle grab (P2-04). */
  readonly hat: HatType | null;
  /** Set by a valid build command; consumed by the dam system each tick (P1-03). */
  readonly wantsBuild: boolean;
  /** Swim intent (P2-03): hold-to-swim. Float only applies in water while true. */
  readonly wantsSwim?: boolean;
  /** Remaining hold time for a transient pose (poke/eat), ms (P2 fix). */
  readonly actionMs?: number;
  /** Remaining build-channel time, ms (>0 while building; P2-06 build channel). */
  readonly buildingMs?: number;
  /** Personal contribution (dam progress added), used for flood settlement. */
  readonly score: number;
  /** True while standing in a water rect (P2-03 漂浮); undefined on land. */
  readonly floating?: boolean;
  /** Number of OTHER otters in the same floating raft; 0/undefined when alone (P2-03). */
  readonly raftLinks?: number;
  /** Mushrooms eaten so far, 0..MAX_MUSHROOM_STACKS (P4-5). Undefined == 0. */
  readonly mushroomStacks?: number;
  /**
   * Visual/hitbox size multiplier from stacked mushrooms (P4-5). 1 == normal
   * size; MUSHROOM_SCALE ** mushroomStacks once eating starts. Game-layer
   * rendering/collision code should read this to scale the otter sprite and
   * hitbox; not wired to Phaser in this slice (core state only).
   */
  readonly scale?: number;
  /**
   * Loot-table gear flags (P4-6), separate from the single cone `hat` slot
   * above. Additive: undefined/both-false == no gear worn.
   */
  readonly gear?: { readonly vest?: boolean; readonly rareHat?: boolean };
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

/* ------------------------------------------------------------------ */
/* P2-04 突發事件 (sudden events): eagle + bear, each a small state    */
/* machine advanced once per tick by hazardSystem (see hazards.ts).    */

/** Which hazard a scheduled spawn / active hazard is. */
export type HazardKind = 'eagle' | 'bear';

/**
 * 🦅 Eagle. Casts a shadow warning over a marked otter for a few seconds,
 * then swoops: if the target is protected (wears a cone) or dodging (in
 * water) it comes up empty; otherwise it GRABS the otter (P2-13), carries it
 * for a couple of seconds (held item drops at the grab point), then drops it
 * frozen. Poking it (or a thrown fish) forces an early, freeze-free drop.
 * Machine: 'warning' -> [carry ->] 'swoop' (leave beat) -> (removed).
 */
export interface EagleState {
  readonly phase: 'warning' | 'swoop' | 'carry';
  /** Otter marked at spawn; the swoop resolves against this id. */
  readonly targetId: string | null;
  /** Shadow / bird position (tracks the target during 'warning'). */
  readonly pos: Vec2;
  /** Remaining time in the current phase, ms. */
  readonly timerMs: number;
  /** Otter being carried during 'carry' (P2-13), else null/undefined. */
  readonly victimId?: string | null;
  /** Where the carried otter gets dropped (P2-13). */
  readonly dropAt?: Vec2;
}

/**
 * 🐻 Bear. Walks in from the forest edge toward the nearest ground fish
 * (the lure) or, if none, the nearest otter. Contact knocks an otter flying
 * (drop + stun). Reaching a fish eats it and lures the bear away.
 * Machine: 'approach' -> 'leaving' -> (removed).
 */
export interface BearState {
  readonly phase: 'approach' | 'leaving';
  readonly pos: Vec2;
  /** Otter being charged (approach) — recomputed each tick. */
  readonly targetOtterId: string | null;
  /** Ground fish being lured toward, if any (takes priority over otters). */
  readonly targetItemId: string | null;
  /** Remaining lifetime (approach) or walk-off time (leaving), ms. */
  readonly timerMs: number;
}

/** A pending hazard spawn: fire when timerMs has counted down to atTimerMs. */
export interface HazardSpawn {
  readonly kind: HazardKind;
  /** Round-timer threshold (ms remaining) at/under which this spawns. */
  readonly atTimerMs: number;
}

/** All hazard state on the GameState (P2-04). Absent when hazards are off. */
export interface HazardsState {
  readonly eagle: EagleState | null;
  readonly bear: BearState | null;
  /** Not-yet-fired spawns, ascending by time-of-round (descending atTimerMs). */
  readonly schedule: readonly HazardSpawn[];
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
  /** Water zones; otters inside float, form rafts, and wash off debuffs (P2-03). */
  readonly water?: readonly Rect[];
  /** Sudden-event hazards (P2-04). Absent/undefined when hazards are disabled. */
  readonly hazards?: HazardsState;
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
  | (CommandBase & { readonly type: 'build' })
  | (CommandBase & { readonly type: 'swim' })
  | (CommandBase & { readonly type: 'stopSwim' });

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
  | {
      /**
       * P4-6: fired for every dig, one per roll, regardless of outcome.
       * P4-endgame stat tallying should listen to this (not dugDirt, which
       * only fires for the 'poop' outcome) and bucket by `outcome`:
       *   - 'poop'     -> poopsDug++ (dugDirt/pitCreated also fire, unchanged)
       *   - 'mushroom' -> mushrooms++ (a ground mushroom item spawns; itemId set)
       *   - 'diamond'  -> diamonds++ (instant score; scoreAwarded set, no itemId)
       *   - 'vest'     -> gear.vest = true on the digger; scoreAwarded set
       *   - 'hat'      -> gear.rareHat = true on the digger; scoreAwarded set
       *   - 'nothing'  -> no state change at all
       */
      readonly type: 'lootRolled';
      readonly playerId: string;
      readonly outcome: 'poop' | 'mushroom' | 'diamond' | 'vest' | 'hat' | 'nothing';
      /** Ground item spawned by this roll (mushroom only), else undefined. */
      readonly itemId?: string;
      /** Instant score granted by this roll (diamond/vest/hat), else undefined. */
      readonly scoreAwarded?: number;
    }
  | { readonly type: 'pitCreated'; readonly pitId: string; readonly pos: Vec2 }
  | { readonly type: 'pitFilled'; readonly pitId: string; readonly playerId: string }
  | { readonly type: 'buildAttempted'; readonly playerId: string }
  | { readonly type: 'damProgressed'; readonly playerId: string; readonly amount: number; readonly progress: number }
  | { readonly type: 'gameWon'; readonly tick: number; readonly scores: Readonly<Record<string, number>> }
  | { readonly type: 'gameLost'; readonly tick: number; readonly scores: Readonly<Record<string, number>> }
  | { readonly type: 'otterEnteredWater'; readonly playerId: string }
  | { readonly type: 'otterLeftWater'; readonly playerId: string }
  | { readonly type: 'debuffWashedOff'; readonly playerId: string }
  | { readonly type: 'raftFormed'; readonly playerIds: readonly string[] }
  | { readonly type: 'eagleWarning'; readonly targetId: string | null; readonly pos: Vec2 }
  | {
      readonly type: 'eagleSwooped';
      readonly targetId: string | null;
      /** Item snatched, or null when the otter was immune/dodging/empty-handed. */
      readonly itemId: string | null;
      readonly grabbed: boolean;
    }
  | { readonly type: 'bearAppeared'; readonly pos: Vec2 }
  | {
      readonly type: 'bearHitOtter';
      readonly playerId: string;
      readonly droppedItemId: string | null;
    }
  | { readonly type: 'bearLured'; readonly itemId: string }
  | { readonly type: 'bearLeft' }
  | { readonly type: 'otterGrabbed'; readonly playerId: string; readonly pos: Vec2 }
  | { readonly type: 'otterDropped'; readonly playerId: string; readonly pos: Vec2 }
  | { readonly type: 'hazardRepelled'; readonly kind: HazardKind; readonly by: string }
  | { readonly type: 'tickCompleted'; readonly tick: number };

export type GameEventType = GameEvent['type'];
