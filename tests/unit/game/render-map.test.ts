/**
 * P2-08/09 wiring: pure render-map mappings + a contract test against the real
 * pipeline output (frames/animations must actually exist in the atlas).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ItemType, OtterState } from '../../../src/core/types';
import {
  CONE_HAT_FRAME,
  heldOverlayFrame,
  DAM_WON_FRAME,
  NPC,
  damStageFrame,
  itemFrame,
  otterAnimKey,
} from '../../../src/game/render-map';

const ITEM_TYPES: ItemType[] = ['branch', 'fish', 'stone', 'cone', 'dirt'];

function otter(partial: Partial<OtterState>): Pick<OtterState, 'action' | 'stunnedMs'> {
  return { action: 'idle', stunnedMs: 0, ...partial } as OtterState;
}

describe('render-map (P2-08/09 wiring)', () => {
  it('maps every item type to an obj_ frame', () => {
    for (const t of ITEM_TYPES) expect(itemFrame(t)).toMatch(/^obj_[a-z]+_\d+$/);
    expect(itemFrame('fish')).toBe('obj_fish_0');
    expect(itemFrame('branch')).toBe('obj_wood_0');
  });

  it('damStageFrame walks 0..3 with progress and uses the decorated frame on win', () => {
    expect(damStageFrame(0, 100, 'playing')).toBe('obj_dam_0');
    expect(damStageFrame(30, 100, 'playing')).toBe('obj_dam_1');
    expect(damStageFrame(60, 100, 'playing')).toBe('obj_dam_2');
    expect(damStageFrame(99, 100, 'playing')).toBe('obj_dam_3');
    expect(damStageFrame(100, 100, 'playing')).toBe('obj_dam_3'); // clamps, not 4
    expect(damStageFrame(0, 0, 'playing')).toBe('obj_dam_0'); // required 0 safe
    expect(damStageFrame(100, 100, 'won')).toBe(DAM_WON_FRAME);
  });

  it('otterAnimKey prioritises lose > win > dizzy > action', () => {
    expect(otterAnimKey(otter({ action: 'walk' }), 'playing')).toBe('otter-walk');
    expect(otterAnimKey(otter({ stunnedMs: 500 }), 'playing')).toBe('otter-dizzy');
    expect(otterAnimKey(otter({ stunnedMs: 500 }), 'won')).toBe('otter-win');
    expect(otterAnimKey(otter({ action: 'build' }), 'lost')).toBe('otter-lose');
  });

  const ATLAS = join(__dirname, '../../../public/assets/otter.json');
  const OBJS = join(__dirname, '../../../public/assets/objects.json');
  const ANIMS = join(__dirname, '../../../public/assets/animations.json');

  describe.skipIf(!existsSync(ATLAS))('contract: referenced frames/anims exist in the atlas', () => {
    const atlas = JSON.parse(readFileSync(ATLAS, 'utf8')) as { frames: Record<string, unknown> };
    const anims = JSON.parse(readFileSync(ANIMS, 'utf8')) as {
      animations: { key: string }[];
    };
    const animKeys = new Set(anims.animations.map((a) => `otter-${a.key}`));

    it('every item / cone / dam frame exists in the atlas', () => {
      for (const t of ITEM_TYPES) expect(atlas.frames[itemFrame(t)]).toBeDefined();
      expect(atlas.frames[CONE_HAT_FRAME]).toBeDefined();
      for (let p = 0; p <= 100; p += 10) {
        expect(atlas.frames[damStageFrame(p, 100, 'playing')]).toBeDefined();
      }
      expect(atlas.frames[DAM_WON_FRAME]).toBeDefined();
    });

    it('every anim key the map emits is registered', () => {
      const keys = [
        otterAnimKey(otter({ action: 'idle' }), 'playing'),
        otterAnimKey(otter({ stunnedMs: 1 }), 'playing'),
        otterAnimKey(otter({}), 'won'),
        otterAnimKey(otter({}), 'lost'),
        NPC.eagle.animKey,
        NPC.bear.animKey,
      ];
      for (const k of keys) expect(animKeys.has(k)).toBe(true);
    });

    it('objects.json lists the obj_ frames the map uses', () => {
      const objs = JSON.parse(readFileSync(OBJS, 'utf8')) as { objects: Record<string, string[]> };
      expect(objs.objects['obj_fish']).toContain('obj_fish_0');
      expect(objs.objects['obj_dam']).toContain('obj_dam_5');
    });
  });
});

describe('P2-11 heldOverlayFrame', () => {
  it('maps fish/stone/dirt to obj_ frames; branch/cone/null have no overlay', () => {
    expect(heldOverlayFrame('fish')).toBe('obj_fish_0');
    expect(heldOverlayFrame('stone')).toBe('obj_stone_2');
    expect(heldOverlayFrame('dirt')).toBe('obj_dirt_0');
    expect(heldOverlayFrame('branch')).toBeNull(); // baked into the carry art
    expect(heldOverlayFrame('cone')).toBeNull(); // worn as a hat instead
    expect(heldOverlayFrame(null)).toBeNull();
  });
});
