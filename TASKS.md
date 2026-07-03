# TASKS — Project Otty, DAM IT!

> 任務板。狀態:`ready`(可認領)/ `blocked`(依賴未完)/ `in_progress` / `done`。
> 認領:填 owner + 日期。超過 24h 未更新可接手。驗收條件 = 測試,先寫測試再實作。
> **每組功能開 feature branch(如 `feat/P2-props`);測試全綠才併回 `main`。**
> **每個任務完成必留一份 `Docs/<任務ID>_summary.md` 摘要**(做了什麼/決策/測試結果/後續注意)。
> **E2E 現可由 agent 直接在 sandbox 用瀏覽器 MCP 執行(MCP 已修好)。**

## P0 地基

| ID | 泳道 | 角色 | 任務 | 依賴 | 驗收條件 | 狀態 | Owner |
|---|---|---|---|---|---|---|---|
| P0-01 | F | Maintainer | Scaffold:Vite + Phaser 3 + TS + Vitest + Playwright + ESLint;`npm run dev/test/check` 可跑 | — | `npm run check` 綠;dev server 開得起來 | done | Claude 2026-07-02 \4
| P0-02 | C | Tester | Playwright smoke:開 dev server → BootScene 載入 → `window.__otty.ready === true` → 截圖 | P0-01 | E2E 綠,截圖存基準目錄 | in_progress | Claude 2026-07-02(spec 已寫,待瀏覽器首跑+基準截圖) \4
| P0-03 | D | Developer | 資產管線 `scripts/prepare-assets.ts`:去背→切幀→縮放→atlas;含管線單元測試 | P0-01 | 對 A–G 跑完輸出合法 RGBA atlas + 動畫 JSON;測試綠 | done | Claude 2026-07-02 \4
| P0-04 | A | Developer | core 骨架:types.ts、command→state→events 迴圈、tick;GameAdapter 介面(local 實作) | P0-01 | unit 測試:空局 tick 不變狀態、指令入列出事件 | done | Claude 2026-07-02 \4
| P0-05 | F | Maintainer | GitHub Actions CI:push → check + unit + E2E(headless) | P0-01,02 | CI 在 main 上全綠 | in_progress | Claude 2026-07-02(workflow 已寫,待 GitHub remote 首跑) \4

## P1 核心循環(單機一局可玩)

| ID | 泳道 | 角色 | 任務 | 依賴 | 驗收條件 | 狀態 | Owner |
|---|---|---|---|---|---|---|---|
| P1-01 | A | Developer | 移動 + 碰撞邊界(core 純邏輯) | P0-04 | unit:方向指令→位置更新、出界夾住 | done | Claude 2026-07-02 \4
| P1-02 | A | Developer | 撿取/放下樹枝 inventory.ts | P0-04 | unit:靠近可撿、手滿不可撿、放下落地 | done | Claude 2026-07-02 \4
| P1-03 | A | Developer | 水壩進度 dam.ts:需求量 = 基礎 × f(玩家數)、多人同建加成 | P0-04 | unit:窮舉 1–10 人需求曲線、加成疊加 | done | Claude 2026-07-02 \4
| P1-04 | A | Developer | 倒數 timer.ts + 洪水勝負判定 | P1-03 | unit:180s 到期 → 依進度出 Win/Lose 事件 | done | Claude 2026-07-02 \4
| P1-05 | B | Developer | GameScene:讀 core 狀態演出;鍵盤輸入→指令;placeholder 圖 | P0-04,P1-01 | 整合測試:場景載入、輸入產生指令 | done | Claude 2026-07-02 \4
| P1-06 | B | Developer | 動畫接入:A/B/C/G atlas 註冊,狀態→動畫切換 | P0-03,P1-05 | 整合:每動作動畫存在且幀數正確 | done | Claude 2026-07-02 \4
| P1-07 | B | Developer | HUD:進度條、倒數、勝負畫面 | P1-04,05 | E2E:HUD 數值與 `window.__otty` 一致 | done | Claude 2026-07-02 \4
| P1-08 | C | Tester | E2E「完整一局」:自動操作撿樹枝蓋壩 → 勝利;放置不動 → 失敗 | P1-07 | 兩條 Playwright 腳本綠 | ready |  \4
| P1-09 | G | Marketing | 用 Character_1/2 立繪做 itch.io 草稿頁 + 一句話賣點文案(中/英) | — | 草稿存 `marketing/`,Stakeholder 過目 | done | Claude 2026-07-02 \4

## P2 完整玩法(單機)

| ID | 泳道 | 角色 | 任務 | 依賴 | 驗收條件 | 狀態 | Owner |
|---|---|---|---|---|---|---|---|
| P2-01 | A | Developer | 道具全套:魚(吃=加速/丟=暈眩)、石頭(重)、三角錐(帽)、挖土+坑 | P1-02 | 每道具 unit 覆蓋效果與約束 | ready |  \4
| P2-02 | A | Developer | 戳人 D:掉物資 + 2s 無敵幀 | P2-01 | unit:被戳掉落、無敵期免疫 | done | Claude 2026-07-02 \4
| P2-03 | A | Developer | 漂浮 F + 手牽手水獺筏、洗澡去 debuff | P1-01 | unit:入水漂浮、連結成串速度加成 | ready |  \4
| P2-04 | A | Developer | 突發事件:老鷹(影子預警/三角錐免疫)、熊(丟魚引開),狀態機 | P2-01 | unit:事件狀態機全路徑 | blocked | |
| P2-05 | A | Developer | AI 水獺:補位行為樹(撿→搬→建),人數平衡 | P1-03 | unit:AI 一人局可在時限內完壩(模擬 tick) | ready |  \4
| P2-06 | B | Developer | D/E/F 動畫 + 事件演出 + 手機虛擬搖桿雙鍵 | P2-01..04 | E2E:手機 viewport 可完整遊玩 | blocked | |
| P2-07 | C | Tester | 全機制 E2E 回歸包 + 60fps 效能檢測腳本 | P2-06 | 回歸全綠;效能報告存檔 | blocked | |
| P2-08 | D | Designer | 缺口資產第一批:樹枝/魚/石頭/三角錐/土塊(規格:RGBA、單幀或 3–4 幀、風格同水獺) | — | 過管線腳本驗證即收 | ready | |
| P2-09 | D | Designer | 缺口資產第二批:老鷹、熊、場景 tiles、水壩三階段 | P2-08 | 同上 | blocked | |

## P3 連線

| ID | 泳道 | 角色 | 任務 | 依賴 | 驗收條件 | 狀態 | Owner |
|---|---|---|---|---|---|---|---|
| P3-01 | E | Developer | Colyseus server:room schema、core 搬上伺服器跑、20Hz tick | P2 全 A 泳道 | server unit 測試綠 | blocked | |
| P3-02 | E | Developer | ColyseusAdapter 實作 GameAdapter;客戶端預測+插值 | P3-01 | 整合:local 與 colyseus adapter 過同一套測試 | blocked | |
| P3-03 | B | Developer | 大廳/準備室/連結加房 `r/ABCD`、中途 spectate | P3-02 | E2E:兩個 browser context 同房互戳 | blocked | |
| P3-04 | C | Tester | 多人 E2E:2 人合作勝利、10 人房、斷線重連 | P3-03 | 全綠 | blocked | |

## P4 打磨 / P5 上線(摘要,屆時由 PM 展開細項)

| ID | 泳道 | 角色 | 任務 | 依賴 |
|---|---|---|---|---|
| P4-01 | D+B | Designer+Dev | 正式資產全面替換 placeholder、UI 皮膚、視覺回歸基準更新 | P2-09,P3-03 |
| P4-02 | B | Developer | 音效/BGM、結算獎項(MVP/最混/吃最多魚) | P3-03 |
| P4-03 | C | Tester | 跨裝置矩陣(桌機/平板/5 年舊手機模擬)、首載 < 3MB 驗證 | P4-01 |
| P5-01 | F | Maintainer | CF Pages + Fly.io 部署、PWA manifest、生產冒煙 E2E | P4-03 |
| P5-02 | G | Marketing | itch.io 正式頁、CrazyGames/Poki 提交、發布素材 | P5-01 |
| P5-03 | C+All | Tester | 10 人真人壓測趴 + 修修補補 | P5-01 |

## Bug / 待決事項

(空 — 發現 bug 開 `BUG-xx` 列於此,附重現步驟與失敗測試)
