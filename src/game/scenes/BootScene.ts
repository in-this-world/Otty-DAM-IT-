import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(480, 270, 'Otty, DAM IT!', { fontSize: '48px', color: '#ffffff' })
      .setOrigin(0.5);
    (window as unknown as Record<string, unknown>).__otty = { ready: true };
  }
}
