/**
 * P4-0 — Traditional Chinese (zh-TW) copy. This is the game's source-of-truth
 * language: values here are the strings that used to be hardcoded. Keep flat,
 * one key per line, grouped by feature prefix so parallel slices append with
 * few merge conflicts. Every key MUST also exist in `en.ts` with matching
 * `{placeholders}` (enforced by tests/unit/i18n.test.ts).
 */
const zhTW: Record<string, string> = {
  // ui.* — cross-cutting controls
  'ui.restart': '重新開始',

  // hint.* — transient in-game toasts
  'hint.needStick': '需要木棍!',

  // game.* — round overlay
  'game.win': '水壩完工!全員獲勝 🎉',
  'game.lose': '洪水來了……下次加油!',
  'game.restartHint': '按 R 再來一局',

  // hud.* — heads-up display
  'hud.controls': 'WASD 移動 · E 撿放 · B 建造 · F 戳 · C 游泳 · T 丟 · G 挖 · Q 吃',

  // lobby.* — connection lobby + ready room
  'lobby.title': '水獺蓋水壩 · 連線大廳',
  'lobby.nickname': '暱稱',
  'lobby.nicknamePlaceholder': '暱稱',
  'lobby.hatColor': '帽子顏色',
  'lobby.scarfColor': '圍巾顏色',
  'lobby.joinCodeLabel': '加入房號',
  'lobby.roomCodePlaceholder': '房號 (ABCD)',
  'lobby.create': '建立房間',
  'lobby.join': '加入房間',
  'lobby.invalidCode': '房號格式錯誤 (需 4 個字母)',
  'lobby.connecting': '連線中…',
  'lobby.connectFailed': '無法連線到伺服器,請稍後再試',
  'lobby.roomTitle': '準備室 · 房號 {code}',
  'lobby.defaultOtter': '水獺',
  'lobby.spectatorTag': '(觀戰)',
  'lobby.shareLink': '分享連結',
  'lobby.ready': '準備',
  'lobby.cancelReady': '取消準備',
  'lobby.start': '開始遊戲',
  'lobby.spectatorNotice': '你將以觀戰身分加入',

  // controls.* — mobile on-screen buttons
  'controls.interact': '撿/放',
  'controls.build': '建',
  'controls.poke': '戳',
  'controls.swim': '游',
  'controls.throw': '丟',
  'controls.dig': '挖',
  'controls.eat': '吃',

  // title.* — end-screen awards (P4-8). {name} = player nickname.
  'title.fish': '{name} — 全魚吞噬者',
  'title.dam': '{name} — 「壩」命建築大師',
  'title.poop': '{name} — 認證挖屎官',
  'title.mush': '{name} — 至尊蘑菇王',
  'title.swim': '{name} — 兼職游泳選手',
  'title.nobita': '{name} — 大雄的夢中情人',
  'title.eagle': '{name} — 老鷹的秘密戀人',
};

export default zhTW;
