/**
 * Wave-2 art mapping (P2-08/09 wiring) — PURE module, zero Phaser imports.
 *
 * Maps core state to atlas frame names / animation keys produced by the asset
 * pipeline (public/assets/otter.json + objects.json + animations.json).
 * Kept pure so it runs under Vitest and stays the single source of truth for
 * "which sprite represents this thing".
 */
import type { ItemType, OtterState, GamePhase } from '../core/types';
import { ANIM_KEY_PREFIX, animationKeyForAction } from './anim/registry';

/** Ground/held item -> a static atlas frame name (obj_* sheets). */
const ITEM_FRAME: Record<ItemType, string> = {
  branch: 'obj_wood_0', // short branch
  fish: 'obj_fish_0', // normal small fish
  stone: 'obj_stone_1', // small rock (0 is a tiny pebble)
  cone: 'obj_cone_0',
  dirt: 'obj_dirt_0',
  // P4-6/P4-5: no art yet (see art pipeline docs); placeholder frame name,
  // deliberately excluded from render-map.test.ts's atlas contract check
  // until the asset pipeline adds obj_mushroom_*.
  mushroom: 'obj_mushroom_0',
};

export function itemFrame(type: ItemType): string {
  return ITEM_FRAME[type];
}

/** Cone hat overlay frame (drawn above the head when an otter wears a cone). */
export const CONE_HAT_FRAME = 'obj_cone_0';

/**
 * P2-11: the carry/build art has a BRANCH painted in, so carrying fish /
 * stone / dirt needs a small held-item sprite overlaid on the paws. Branch
 * returns null (already in the art); the cone is worn as a hat, not held.
 */
export function heldOverlayFrame(carrying: ItemType | null): string | null {
  switch (carrying) {
    case 'fish':
      return 'obj_fish_0';
    case 'stone':
      return 'obj_stone_2';
    case 'dirt':
      return 'obj_dirt_0';
    default:
      return null;
  }
}

/** Number of linear dam build stages baked into obj_dam (frames 0..3). */
export const DAM_BUILD_STAGES = 4;
/** Celebratory "decorated" dam frame shown on a win (obj_dam_5). */
export const DAM_WON_FRAME = 'obj_dam_5';

/**
 * Dam build sprite for the current progress. Frames obj_dam_0..3 are the linear
 * build stages (empty -> half -> nearly -> finished); on a win we swap to the
 * decorated frame. `required <= 0` is treated as stage 0.
 */
export function damStageFrame(progress: number, required: number, phase: GamePhase): string {
  if (phase === 'won') return DAM_WON_FRAME;
  const ratio = required > 0 ? Math.min(1, Math.max(0, progress / required)) : 0;
  const stage = Math.min(DAM_BUILD_STAGES - 1, Math.floor(ratio * DAM_BUILD_STAGES));
  return `obj_dam_${stage}`;
}

/**
 * Animation key for an otter, considering round phase and status first:
 * lost -> lose, won -> win, stunned -> dizzy, else the action clip.
 * Returns a prefixed key (`otter-*`) matching registerAnimations().
 */
export function otterAnimKey(otter: Pick<OtterState, 'action' | 'stunnedMs'>, phase: GamePhase): string {
  if (phase === 'lost') return `${ANIM_KEY_PREFIX}lose`;
  if (phase === 'won') return `${ANIM_KEY_PREFIX}win`;
  if (otter.stunnedMs > 0) return `${ANIM_KEY_PREFIX}dizzy`;
  return animationKeyForAction(otter.action);
}

/** NPC (hazard) render keys + display sizes. Bear >> otter >> eagle. */
export const NPC = {
  eagle: { animKey: `${ANIM_KEY_PREFIX}eagle`, displayHeight: 84 },
  bear: { animKey: `${ANIM_KEY_PREFIX}bear`, displayHeight: 150 },
} as const;
