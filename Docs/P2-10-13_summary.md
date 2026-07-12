# P2-10~13(+P2-07/14 部分)播測修正 — 任務摘要

**日期**:2026-07-12 · **Owner**:Claude · **來源**:boss 播測回饋(計畫見 Docs/P2-10-14_plan.md)

## 做了什麼
- **P2-10 輸入補全**:core 的 `throwItem`/`dig`/`useItem` 一直存在但從未綁鍵。新增 **T 丟魚、G 挖土、Q 吃魚**(鍵盤 CODE_MAP + 邊緣觸發)+ 手機三顆新按鍵(丟/挖/吃)+ HUD 操作說明更新。
- **P2-11 持物演出**:carry/build 美術把樹枝畫死在圖裡 → 新增 `heldOverlayFrame`(fish→obj_fish_0、stone→obj_stone_2、dirt→obj_dirt_0),GameScene 疊加在手邊(隨 facing 翻轉);樹枝不疊(圖中已有)、錐帽照舊戴頭上。
- **P2-12 場景/物件一致性**:
  - 水域 3×2 → **4×2 格**(`WATER_RECT {0,384,384,156}`),玩法邊界=畫面。
  - 溪流從壩下游以河床 tiles 蜿蜒**接進左下的河**(不再斷頭)。
  - **建造判定改矩形** `BUILD_ZONE_HALF {w:120,h:56}` 並讓畫面壩區矩形直接用同一常數(舊圓形半徑 120 允許在壩區圖形下方 84px 處建造=boss 回報的 bug)。AI 同步改用矩形判定。
  - **魚只生成於水中**(散布時陸上物品也會避開水域,最多 8 次決定性重擲)且**會游動**:新 `fishSwimSystem`(FNV hash(id,epoch) 決定航向,~2.5s 換向,26u/s,離岸 14px 內夾住;被持有/在陸上不動;不碰 rngSeed,決定性)。
- **P2-13 鷹改抓人 + 反擊**:
  - 鷹俯衝改為**抓住水獺**(手上物品掉在被抓點、不再被叼走消失)→ 飛向遠離壩的落點(260u,邊界內縮 48)**載飛 2s** → 丟下 → **冰凍 3s**(`otterStunned cause:'eagle'`,演出=暈眩)。錐帽/水中免疫保留。
  - **反擊**:F 戳(範圍內無水獺時)可趕走俯衝/載人中的鷹與逼近中的熊;**丟魚**軌跡掃過鷹/熊同樣驅離。被救的隊友原地釋放**不冰凍**(救援獎勵)。新事件 `otterGrabbed/otterDropped/hazardRepelled`。
- **P2-07/14 回歸**:E2E 新增 mechanics.spec(魚生成於河中、魚會游、G 挖出土)+ perf.spec(忙碌 8 秒 rAF 取樣,寫 `test-results/perf-report.json`,門檻 avg≥30fps〔headless 寬鬆〕)。

## 測試
`npm run check` 全綠:**259 unit**(+14)+ build 綠;E2E 於 CI 跑(凍結截圖因水域/溪流/壩區變更會重生 linux 基準)。

## 後續注意
- 鍵位 T/G/Q、冰凍 3s、載飛 2s 皆為常數,boss 可再調(hazards.ts / input.ts)。
- 魚游動只在 core 改 pos;若 P3 上伺服器,同一系統直接可用(決定性)。
- 鷹「載人」期間玩家 stunnedMs 被持續補到 250ms 以封鎖操作——若未來加「掙脫」機制,從這裡開閘。
