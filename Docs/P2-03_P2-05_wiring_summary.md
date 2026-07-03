# P2-03 + P2-05 game-loop wiring (GameScene)

## 做了什麼
接線 core 已完成的 P2-03(漂浮/水獺筏/洗澡)與 P2-05(AI 水獺)進 Phaser 遊戲迴圈。

- **P2-03 water**:`GameScene` 新增 `WATER` 佔位水域 `[{x:40,y:372,w:250,h:140}]`,傳入 `LocalAdapter` config 的 `water`;`createWater()` 畫半透明藍色矩形。水獺入水由 `floatSystem` 自動轉 `float` 動作(已註冊),既有 `renderOtters` 直接演出;raft 加速由 `effectiveSpeedPerSec` 自動生效。
- **P2-05 AI**:`GameScene.driveAi(state)` 每個 tick(`adapter.onState` 回呼)對所有非玩家水獺呼叫 `planOtterCommands` 並 `sendCommand` 回 adapter。AI 數量 = `params.ai ?? recommendedAiCount(HUMAN_COUNT=1, DEFAULT_PARTY_SIZE=3)`(預設 2 隻補位),`playerCount = 1 + aiCount`。
- **`?ai=N` 參數**(`params.ts`,clamp 0..8):覆寫 AI 數;E2E 全數 pin `ai=0` 維持單獺確定性(smoke / hud×2 / full-round WIN+LOSE)。
- **薄整合測試** `tests/unit/game/ai-wiring.integration.test.ts`:走真正 adapter 路徑(LocalAdapter + water config + 每 tick planOtterCommands),驗證「人類發呆、2 隻 AI 把壩蓋完獲勝、人類 score=0」。

## 關鍵決策
- AI 判定 = 「id ≠ PLAYER_ID 的水獺皆 AI」,毋須在 core 加 isAI 型別(game-layer 決定)。
- 單機 solo 預設補 2 隻 AI 隊友(補位/平衡);測試用 `?ai=0` 關閉。
- 水域為佔位座標,待 P2-08/P4 正式關卡與美術。

## 測試結果
- `npm run check` 全綠:**155 測試**(154 + 1 wiring 整合)。tsc + eslint 乾淨。
- `vite build` 成功(見合併後驗證)。

## 後續注意
- E2E 首跑仍待(需 linux 基準截圖);加 AI 後預設畫面會多水獺,但 E2E 已 pin `ai=0`,基準維持單獺。
- AI 無避坑/不撿道具(純建材補位工);漂浮/水獺筏尚無專屬視覺(借 float 動畫)。
- `raftFormed` 每 tick 觸發(非邊緣),演出層若要一次性 SFX 需自行 de-dupe。
