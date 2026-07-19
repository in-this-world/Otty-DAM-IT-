/**
 * P4-0: zh-TW dictionary (source-of-truth strings, extracted verbatim from
 * the UI). Flat Record<string, string> so future P4 branches can append
 * keys with minimal merge conflicts — one key per line, alphabetical-ish by
 * feature prefix (game.*, hud.*, lobby.*, ui.*, hint.*).
 */
const zhTW: Record<string, string> = {
  // Shared / cross-cutting keys other P4 slices depend on.
  'ui.restart': '重新開始',
  'hint.needStick': '需要木棍!',

  // GameScene: win/lose overlay + HUD.
  'game.win': '水壩完工!全員獲勝 🎉',
  'game.lose': '洪水來了……下次加油!',
  'game.restartHint': '按 R 再來一局',
  'hud.controls': 'WASD移動 · E撿放 · B建造 · F戳 · C游泳 · T丟 · G挖 · Q吃',

  // LobbyOverlay: screen 1 (setup).
  'lobby.title': '水獺蓋水壩 · 連線大廳',
  'lobby.nickname': '暱稱',
  'lobby.hatColor': '帽子顏色',
  'lobby.scarfColor': '圍巾顏色',
  'lobby.roomCodePlaceholder': '房號 (ABCD)',
  'lobby.joinCodeLabel': '加入房號',
  'lobby.invalidCode': '房號格式錯誤 (需 4 個字母)',
  'lobby.create': '建立房間',
  'lobby.join': '加入房間',
  'lobby.connecting': '連線中…',
  'lobby.connectFailed': '無法連線到伺服器,請稍後再試',

  // LobbyOverlay: screen 2 (準備室 roster).
  'lobby.roomTitle': '準備室 · 房號 {code}',
  'lobby.ownerBadge': ' 👑',
  'lobby.spectatorBadge': ' (觀戰)',
  'lobby.shareLink': '分享連結',
  'lobby.ready': '準備',
  'lobby.unready': '取消準備',
  'lobby.start': '開始遊戲',
  'lobby.spectatorNotice': '你將以觀戰身分加入',
  'lobby.langToggle': 'EN',

  // LobbyOverlay: 準備室 shared drawing canvas (P4-7).
  'drawing.clearMine': '清除我的塗鴉',

  // MobileControls: on-screen action button labels.
  'controls.interact': '撿/放',
  'controls.build': '建',
  'controls.poke': '戳',
  'controls.swim': '游',
  'controls.throw': '丟',
  'controls.dig': '挖',
  'controls.eat': '吃',

  // End screen: per-player titles (P4-8).
  'title.fish': '{name} - 全魚吞噬者',
  'title.dam': '{name} - 「壩」命建築大師',
  'title.poop': '{name} - 認證挖屎官',
  'title.mush': '{name} - 至尊蘑菇王',
  'title.swim': '{name} - 兼職游泳選手',
  'title.nobita': '{name} - 大雄的夢中情人',
  'title.eagle': '{name} - 老鷹的秘密戀人',
};

export default zhTW;
