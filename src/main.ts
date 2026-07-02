import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#2d6a7a',
  physics: { default: 'arcade' },
  scene: [BootScene, GameScene],
});
