/**
 * P1-06: animation manifest validation + registration (pure module),
 * plus a contract test against the real pipeline output.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  animationKeyForAction,
  missingActions,
  OTTER_ACTIONS,
  registerAnimations,
  validateManifest,
  type AnimationManifest,
  type AnimationRegistrar,
} from '../../../src/game/anim/registry';

const MANIFEST_PATH = join(__dirname, '../../../public/assets/animations.json');

function fakeRegistrar(existing: string[] = []) {
  const created: string[] = [];
  const keys = new Set(existing);
  const anims: AnimationRegistrar = {
    exists: (key) => keys.has(key),
    create: (config) => {
      keys.add(config.key);
      created.push(config.key);
      return config;
    },
  };
  return { anims, created };
}

const VALID: AnimationManifest = {
  animations: [
    { key: 'idle', frames: ['idle-0', 'idle-1'], frameRate: 8, repeat: -1 },
    { key: 'poke', frames: ['poke-0'], frameRate: 8, repeat: 0 },
  ],
};

describe('game/anim/registry (P1-06)', () => {
  it('maps every core action to a prefixed animation key', () => {
    for (const action of OTTER_ACTIONS) {
      expect(animationKeyForAction(action)).toBe(`otter-${action}`);
    }
  });

  it('validateManifest accepts the valid shape and reports broken entries', () => {
    expect(validateManifest(VALID)).toEqual([]);
    expect(validateManifest(null)).toHaveLength(1);
    expect(validateManifest({})).toHaveLength(1);
    const broken = validateManifest({
      animations: [{ key: '', frames: [], frameRate: 0, repeat: -2 }],
    });
    expect(broken).toHaveLength(4);
  });

  it('missingActions reports core actions without a clip', () => {
    expect(missingActions(VALID)).toEqual(
      OTTER_ACTIONS.filter((a) => a !== 'idle' && a !== 'poke'),
    );
  });

  it('registerAnimations creates each clip once (idempotent) with the texture key', () => {
    const { anims, created } = fakeRegistrar(['otter-idle']);
    const result = registerAnimations(anims, VALID, 'otter');
    expect(result).toEqual(['otter-poke']);
    expect(created).toEqual(['otter-poke']);
    // second run: nothing new
    expect(registerAnimations(anims, VALID, 'otter')).toEqual([]);
  });

  describe.skipIf(!existsSync(MANIFEST_PATH))('real pipeline manifest contract', () => {
    it('public/assets/animations.json is valid and covers every core action', () => {
      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AnimationManifest;
      expect(validateManifest(manifest)).toEqual([]);
      expect(missingActions(manifest)).toEqual([]);
      for (const entry of manifest.animations) {
        expect(entry.frames.length, entry.key).toBeGreaterThan(0);
      }
    });
  });
});
