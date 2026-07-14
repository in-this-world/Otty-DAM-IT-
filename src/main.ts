import Phaser from 'phaser';
import { LobbyController } from './net/lobby-controller';
import { LobbyOverlay } from './game/lobby/LobbyOverlay';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';

const baseConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  backgroundColor: '#2d6a7a',
  physics: { default: 'arcade' },
  scene: [BootScene, GameScene],
};

/**
 * Boot. Single-player is the default (unchanged). Multiplayer engages only
 * when a `#/r/ABCD` deep link or `?net` flag is present AND a server URL is
 * configured (VITE_COLYSEUS_URL): the 準備室 overlay connects, then injects the
 * ColyseusAdapter into the Phaser registry so GameScene renders the netgame.
 */
async function boot(): Promise<void> {
  const code = LobbyController.codeFromLocation(window.location.hash);
  const netFlag = new URLSearchParams(window.location.search).has('net');
  const serverUrl = import.meta.env.VITE_COLYSEUS_URL as string | undefined;

  if ((code || netFlag) && serverUrl) {
    try {
      const result = await new LobbyOverlay({ serverUrl, initialCode: code }).run();
      new Phaser.Game({
        ...baseConfig,
        callbacks: {
          preBoot: (game) => {
            game.registry.set('netAdapter', result.adapter);
            game.registry.set('netLocalId', result.localPlayerId);
          },
        },
      });
      return;
    } catch {
      // Fall through to single-player if the lobby/connection fails.
    }
  }

  new Phaser.Game(baseConfig);
}

void boot();
