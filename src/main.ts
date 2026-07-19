import Phaser from 'phaser';
import { LobbyController } from './net/lobby-controller';
import { LobbyOverlay } from './game/lobby/LobbyOverlay';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';
import type { EndScreenProfile } from './game/end-screen';
import type { RosterPayload } from './net/protocol';
import type { PlayerStats } from './core/stats';

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

/** Build the {otterId -> {nickname, owner}} map GameScene's end screen
 *  (P4-2) and host-restart control (P4-4) both read from the registry. */
function rosterToProfiles(payload: RosterPayload): Record<string, EndScreenProfile> {
  const map: Record<string, EndScreenProfile> = {};
  for (const p of payload.players) {
    if (p.otterId) map[p.otterId] = { nickname: p.nickname, owner: p.owner };
  }
  return map;
}

/**
 * P4-8: build the {otterId -> PlayerStats} map GameScene's end screen reads
 * for title assignment, merging each player's server-tallied `stats`
 * (RoomSimulation.stats(), relayed via RosterEntry.stats) with their
 * doodleCount (tracked separately per-session — see RoomSimulation.
 * doodleCount). Players without an otterId (spectators) or without stats
 * yet (round hasn't started) are skipped.
 */
function rosterToStats(payload: RosterPayload): Record<string, PlayerStats> {
  const map: Record<string, PlayerStats> = {};
  for (const p of payload.players) {
    if (!p.otterId || !p.stats) continue;
    map[p.otterId] = { ...p.stats, doodles: p.doodleCount };
  }
  return map;
}

/**
 * Boot. Single-player is the default (unchanged). Multiplayer engages only
 * when a #/r/ABCD deep link or ?net flag is present AND a server URL is
 * configured (VITE_COLYSEUS_URL): the 準備室 overlay connects, then injects the
 * ColyseusAdapter into the Phaser registry so GameScene renders the netgame.
 *
 * P4-4: after the round starts, LobbyResult.onRoster keeps streaming roster
 * updates (nickname/owner map for P4-2/P4-4, and the phase flipping back to
 * 'lobby' when the owner restarts). On a return to 'lobby' the whole Phaser
 * game is torn down and boot() re-runs, showing the ready-room overlay again
 * on the same still-connected room, so no re-join round-trip.
 */
async function boot(): Promise<void> {
  const code = LobbyController.codeFromLocation(window.location.hash);
  const netFlag = new URLSearchParams(window.location.search).has('net');
  const serverUrl = import.meta.env.VITE_COLYSEUS_URL as string | undefined;

  if ((code || netFlag) && serverUrl) {
    try {
      const result = await new LobbyOverlay({ serverUrl, initialCode: code }).run();
      const game = new Phaser.Game({
        ...baseConfig,
        callbacks: {
          preBoot: (g) => {
            g.registry.set('netAdapter', result.adapter);
            g.registry.set('netLocalId', result.localPlayerId);
            g.registry.set('netRosterMap', {} as Record<string, EndScreenProfile>);
            g.registry.set('netStatsMap', {} as Record<string, PlayerStats>);
            g.registry.set('netIsOwner', false);
            g.registry.set('netSendRestart', result.sendRestart);
          },
        },
      });
      let wasPlaying = false;
      result.onRoster((payload) => {
        game.registry.set('netRosterMap', rosterToProfiles(payload));
        game.registry.set('netStatsMap', rosterToStats(payload));
        const mine = result.localPlayerId ? rosterToProfiles(payload)[result.localPlayerId] : undefined;
        game.registry.set('netIsOwner', Boolean(mine?.owner));
        if (payload.phase === 'playing' || payload.phase === 'ended') wasPlaying = true;
        if (wasPlaying && payload.phase === 'lobby') {
          // Owner restarted (P4-4): tear this round down and reboot into
          // the 準備室 lobby overlay on the same still-connected room.
          game.destroy(true);
          void boot();
        }
      });
      return;
    } catch {
      // Fall through to single-player if the lobby/connection fails.
    }
  }

  new Phaser.Game(baseConfig);
}

void boot();
