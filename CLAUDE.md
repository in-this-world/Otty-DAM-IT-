# CLAUDE.md — Project Otty, DAM IT!

Phaser 3 派對遊戲《水獺蓋水壩》。**接手前先讀 `STATE.md` → `TASKS.md` → `MASTER_PLAN.md` §0。**

## 指令
- `npm run dev` — Vite dev server(E2E 前先啟動)
- `npm test` — Vitest unit/整合
- `npm run e2e` — Playwright(agent 亦可直接用 Playwright MCP 操作瀏覽器測試)
- `npm run check` — typecheck + lint + unit(合併前必綠)
- `npm run assets` — 資產管線(Assets/ 原圖 → public/assets/)

## 鐵則
1. **TDD**:先寫失敗測試,再實作。無測試的 PR 不合併。
2. 遊戲邏輯只寫在 `src/core/`(零 Phaser import);`src/game/` 只做演出。
3. **每個任務結束三件事齊備才算完成**:(a) 更新 `TASKS.md` 狀態、(b) 更新 `STATE.md` 快照、(c) **在 `Docs/` 寫一份任務摘要** `Docs/<任務ID>_summary.md`(如 `Docs/P2-03_summary.md`;內容:做了什麼、關鍵決策、測試結果、後續注意事項)。
4. 只改自己認領任務所屬泳道的目錄;動共用型別要記入 STATE.md Decisions。
5. E2E 斷言用 `window.__otty` 唯讀狀態 + 截圖視覺回歸,不解析像素。**E2E 現在可由 agent 直接在 sandbox 內用瀏覽器 MCP 執行(MCP 已修好),不再只能靠本機/CI。**
6. **分支策略**:開發一組功能(feature set)時開新 branch(如 `feat/P2-props`),WIP 也 commit 到該 branch;**功能完成且測試全綠(`npm run check` + 相關 E2E)後,才合併回 `main`**。`main` 永遠保持可玩、綠燈。
7. Commit:`P1-03: dam requirement curve + tests`(任務 ID 開頭)。

## 測試層級
- unit(多數):`tests/unit/` 對 `src/core/`
- 整合(薄):Phaser 場景可載入、動畫已註冊
- E2E(每個玩家可感知功能一條):`tests/e2e/`,Playwright MCP 驅動

## 路徑注意
Assets 原圖檔名含中文+空格(如 `A. 待機 Idle.png`),shell 操作務必加引號。
