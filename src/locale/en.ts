/**
 * P4-0: English dictionary — translations of the zh-TW source strings.
 * Keep this file's key set in sync with zh-TW.ts (same keys, English values).
 */
const en: Record<string, string> = {
  // Shared / cross-cutting keys other P4 slices depend on.
  'ui.restart': 'Restart',
  'hint.needStick': 'You need a stick!',

  // GameScene: win/lose overlay + HUD.
  'game.win': 'Dam complete! Everyone wins 🎉',
  'game.lose': 'The flood arrived… better luck next time!',
  'game.restartHint': 'Press R to play again',
  'hud.controls': 'WASD move · E pick/drop · B build · F poke · C swim · T throw · G dig · Q eat',

  // LobbyOverlay: screen 1 (setup).
  'lobby.title': 'Otty, Dam It! · Online Lobby',
  'lobby.nickname': 'Nickname',
  'lobby.hatColor': 'Hat Color',
  'lobby.scarfColor': 'Scarf Color',
  'lobby.roomCodePlaceholder': 'Room code (ABCD)',
  'lobby.joinCodeLabel': 'Join Room Code',
  'lobby.invalidCode': 'Invalid room code (needs 4 letters)',
  'lobby.create': 'Create Room',
  'lobby.join': 'Join Room',
  'lobby.connecting': 'Connecting…',
  'lobby.connectFailed': 'Could not reach the server, please try again later',

  // LobbyOverlay: screen 2 (ready room roster).
  'lobby.roomTitle': 'Ready Room · Room {code}',
  'lobby.ownerBadge': ' 👑',
  'lobby.spectatorBadge': ' (Spectating)',
  'lobby.shareLink': 'Share Link',
  'lobby.ready': 'Ready',
  'lobby.unready': 'Unready',
  'lobby.start': 'Start Game',
  'lobby.spectatorNotice': 'You will join as a spectator',
  'lobby.langToggle': '中',

  // MobileControls: on-screen action button labels.
  'controls.interact': 'Grab',
  'controls.build': 'Build',
  'controls.poke': 'Poke',
  'controls.swim': 'Swim',
  'controls.throw': 'Throw',
  'controls.dig': 'Dig',
  'controls.eat': 'Eat',
};

export default en;
