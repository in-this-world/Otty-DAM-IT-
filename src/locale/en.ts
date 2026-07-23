/**
 * P4-0 — English (en) copy. Every key mirrors `zh-TW.ts` exactly (same keys,
 * same `{placeholders}`); tests fail if they drift. Keep flat and grouped by
 * prefix to match the source-of-truth dictionary.
 */
const en: Record<string, string> = {
  // ui.*
  'ui.restart': 'Restart',

  // hint.*
  'hint.needStick': 'You need a stick!',

  // game.*
  'game.win': 'Dam complete — everyone wins! 🎉',
  'game.lose': 'The flood came… get them next time!',
  'game.restartHint': 'Press R to play again',

  // hud.*
  'hud.controls': 'Move WASD · E grab · B build · F poke · C swim · T throw · G dig · Q eat',

  // lobby.*
  'lobby.title': 'Otty, DAM IT! · Lobby',
  'lobby.nickname': 'Nickname',
  'lobby.nicknamePlaceholder': 'Nickname',
  'lobby.hatColor': 'Hat colour',
  'lobby.scarfColor': 'Scarf colour',
  'lobby.joinCodeLabel': 'Room code',
  'lobby.roomCodePlaceholder': 'Room code (ABCD)',
  'lobby.create': 'Create room',
  'lobby.join': 'Join room',
  'lobby.invalidCode': 'Invalid code (needs 4 letters)',
  'lobby.connecting': 'Connecting…',
  'lobby.connectFailed': "Can't reach the server — please try again shortly",
  'lobby.roomTitle': 'Ready room · {code}',
  'lobby.defaultOtter': 'Otter',
  'lobby.spectatorTag': '(spectating)',
  'lobby.shareLink': 'Share link',
  'lobby.ready': 'Ready',
  'lobby.cancelReady': 'Cancel ready',
  'lobby.start': 'Start game',
  'lobby.spectatorNotice': "You'll join as a spectator",

  // controls.*
  'controls.interact': 'Grab',
  'controls.build': 'Build',
  'controls.poke': 'Poke',
  'controls.swim': 'Swim',
  'controls.throw': 'Throw',
  'controls.dig': 'Dig',
  'controls.eat': 'Eat',

  // title.*
  'title.fish': '{name} — Devourer of All Fish',
  'title.dam': '{name} — DAM Hard Builder',
  'title.poop': '{name} — Certified Poop Digger',
  'title.mush': '{name} — Supreme Mushroom King',
  'title.swim': '{name} — Part-Time Swimmer',
  'title.nobita': "{name} — Nobita's Dream Girl",
  'title.eagle': "{name} — The Eagle's Secret Lover",
};

export default en;
