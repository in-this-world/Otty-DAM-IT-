/**
 * Boot: load the otter atlas + animation manifest (P0-03 pipeline output),
 * register animations (P1-06), then hand over to GameScene.
 * window.__otty.ready flips true once boot completes (E2E smoke contract).
 */
import Phaser from 'phaser';
import { registerAnimations, type AnimationManifest } from '../anim/registry';

export const OTTER_TEXTURE = 'otter';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Anchor relative asset URLs to the Vite base ('/' locally, '/Otty-DAM-IT-/'
    // on GitHub Pages) so the atlas loads under a project sub-path too (P2-deploy).
    this.load.setBaseURL(import.meta.env.BASE_URL);
    this.load.atlas(OTTER_TEXTURE, 'assets/otter.png', 'assets/otter.json');
    this.load.json('otter-animations', 'assets/animations.json');
  }

  create(): void {
    const manifest = this.cache.json.get('otter-animations') as AnimationManifest;
    registerAnimations(this.anims, manifest, OTTER_TEXTURE);

    this.add
      .text(480, 270, 'Otty, DAM IT!', { fontSize: '48px', color: '#ffffff' })
      .setOrigin(0.5);

    (window as unknown as Record<string, unknown>).__otty = { ready: true };
    // brief title card, then into the round
    this.time.delayedCall(300, () => this.scene.start('Game'));
  }
}
