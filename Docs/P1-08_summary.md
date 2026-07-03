# P1-08 — 完整回合 E2E(贏 + 輸)

**Files**: `tests/e2e/full-round.spec.ts`(新)、`src/game/params.ts`、
`src/game/scenes/GameScene.ts`(只接 URL 參數)、`src/game/snapshot.ts`(加欄位)、
對應 unit tests(`tests/unit/game/{params,snapshot}.test.ts`)。

## 新增 URL test hooks(pure,已 unit-test)

| Hook | 作用 | Clamp |
| --- | --- | --- |
| `?timer=<ms>` | 覆寫回合長度(GameScene 傳入 `timerMs`) | 1 000–600 000 ms;垃圾值 → 忽略 |
| `?required=<n>` | 覆寫 `damRequiredPerPlayer`(傳入 `createInitialState` config) | 1–100;垃圾值 → 忽略 |

既有 `?seed=` / `?freeze=` 不變。皆為測試專用;正常遊玩不帶參數、行為不變。

## snapshot 加欄位(additive)

`window.__otty.items: [{id, x, y, type}]` — 地上(未被持有)物品的座標,
bot 導航必需。既有欄位全部保留;`itemsOnGround === items.length`。

## Bot 策略(WIN test)

URL:`/?seed=1&required=3&timer=120000`(3 根樹枝即獲勝、2 分鐘不可能輸)。
100 ms 輪詢迴圈,每輪重新讀 `__otty`:

1. 空手 → 找最近地上物品,朝它走。
2. 走法:一次只按住一顆方向鍵 — 消去「軸差較大」那軸(符合 input.ts
   的 held-direction 優先規則;換鍵前先放開舊鍵)。
3. 距目標 ≤28px(PICKUP_RADIUS=48,留 20px 超衝餘裕)按 `E`,
   以 `carrying !== null` 確認(1.5s 內沒成功就繼續輪詢重試)。
4. 持枝 → 走向壩址 (480, 96),≤90px(BUILD_RADIUS=120)按 `B`,
   以 `carrying === null || phase === 'won'` 確認。
5. 重複直到 `phase === 'won'`。預算 90 s,test timeout 120 s。

自我修正:每輪從最新 state 重新決策,超衝/邊界 clamp/miss 都會在下一輪修正。

斷言:`phase === 'won'`、`dam.progress >= dam.required`、`timerMs > 0`。

## LOSE test

`/?seed=1&timer=3000`,完全不操作,`waitForFunction(phase === 'lost')`
(timeout 20 s),斷言 `dam.progress === 0`、`timerMs === 0`。

## 沙箱驗證狀態(瀏覽器跑不了,只做靜態)

- `npx playwright test --list` → **5 tests**(smoke 1 + hud 2 + full-round 2)✅
- `npx tsc --noEmit` ✅ · eslint(改動檔案)✅
- `npx vitest run` → 17 files / 96 tests 全綠 ✅

## 真機必驗(user 執行)

```
npm run e2e
```

預期:**5 passed**(webServer 會自動起 `npm run dev`)。WIN test 正常應在
20–60 s 內完成。

## 風險 / 調整旋鈕(timing flakiness)

- **超衝**:機器慢時單次輪詢位移 >20px 可能反覆過站 → 調大
  `PICKUP_TRIGGER`(≤40)或縮小 `POLL_MS`。
- **按鍵時序**:`press('KeyE')` 落在 pickup 半徑外 → confirm 會 miss,
  外層迴圈自動重試,理論上只慢不掛;若常發生同上調 trigger。
- **預算**:seed=1 佈局若三根樹枝都極遠,90 s 預算可再加(`BOT_BUDGET_MS`)。
- **LOSE test** 幾乎無 flake 面(純等待)。
- P2-01(並行泳道)若改變 build/pickup 語意(如 build 不再消耗樹枝),
  `confirmBuilt` 的判斷需同步更新。
