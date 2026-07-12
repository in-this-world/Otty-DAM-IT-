# 🦦 Project Otty, DAM IT! — Master Plan

> 版本 1.0 · 2026-07-02 · 取代《水獺蓋水壩_遊戲計畫 v0.1》
> 平台:Web 瀏覽器 · Phaser 3 + TypeScript · TDD · 多 Agent 平行開發

---

## 0. 給 Agent 的接手協議 (Agent Resume Protocol)

任何 agent(或人)接手本專案時,**依序執行**:

1. 讀 `STATE.md` — 專案目前進度快照、最後一次 session 做了什麼
2. 讀 `TASKS.md` — 找出 `status: ready` 且無未完成依賴的任務,認領(填入 owner)
3. 讀 `CLAUDE.md` — 開發規範、指令、TDD 規則
4. 工作流程:**開 feature branch → 先寫失敗測試 → 實作到綠燈 → 重構 → 跑全部測試** (red-green-refactor)
5. 收尾三件事:更新 `TASKS.md` 任務狀態 + `STATE.md` 快照 + **在 `Docs/` 寫 `<任務ID>_summary.md` 任務摘要**,commit 到 feature branch(格式見 CLAUDE.md);功能整組完成且測試全綠才合併回 `main`

**鐵則:** 沒有失敗測試就不寫產品程式碼;每個任務都要留一份 `Docs/` 摘要;不更新 STATE.md 不結束 session;未測試綠燈不合併 `main`。

---

## 1. 核心概念(不變)

一群水獺在洪水倒數前,合力(或互相搗亂)收集物資把水壩蓋好,守住家園。

- 類型:合作+輕度混戰派對遊戲,一局 3–5 分鐘
- 勝利:倒數結束前水壩完成度 ≥ 100% → 全體獲勝;否則洪水結算個人貢獻
- 設計支柱:**零門檻**(開網頁即玩)、**好笑優先**、**一看就懂**
- 易入門策略、玩法細節(道具/動作/突發事件/合作 vs 搗蛋平衡)沿用原計畫 v0.1 §2–4,此處不重複;實作時以 `TASKS.md` 各任務的驗收條件為準

---

## 2. 技術棧(已定案)

| 層 | 選擇 | 備註 |
|---|---|---|
| 遊戲引擎 | **Phaser 3** + TypeScript | 已定案,不再評估替代 |
| 建置 | Vite | dev server + 靜態打包 |
| 單元/整合測試 | **Vitest** | 純邏輯層測試,headless、快 |
| E2E 測試 | **Playwright(經 Playwright MCP)** | agent 直接驅動瀏覽器驗證遊戲畫面與流程;**MCP 已修好,可在 sandbox 內直接跑** |
| 物理 | Phaser Arcade | 漂浮用簡化浮力,不做真物理同步 |
| 連線(Phase 3) | Colyseus | server-authoritative,20Hz tick |
| 部署 | Cloudflare Pages(前端)+ Fly.io(伺服器) | CI/CD 用 GitHub Actions |

### 2.1 可測試架構(TDD 的關鍵)

**核心規則:遊戲邏輯與 Phaser 渲染分離。**

```
src/
  core/        ← 純 TypeScript,零 Phaser 依賴。可 100% 用 Vitest 測
    dam.ts         水壩進度、需求量 = f(玩家數)
    inventory.ts   撿取/放下/被戳掉落
    timer.ts       倒數、洪水判定
    events/        老鷹、熊(狀態機)
    ai/            AI 水獺行為樹
  game/        ← Phaser 場景層,只做「讀 core 狀態 → 演出」
    scenes/    Boot, Lobby, Game, Result
    anim/      spritesheet 載入與動畫註冊
  net/         ← Phase 3 才建,Colyseus client,介面先以 LocalAdapter 模擬
public/assets/ ← 處理後的遊戲資產(見 §3)
tests/
  unit/        Vitest — core 邏輯
  e2e/         Playwright — 開遊戲、截圖、斷言
```

- `core/` 以 **command → state → events** 模式寫:輸入指令、輸出新狀態與事件。這讓 Phase 3 接 Colyseus 時,同一份 core 直接搬到伺服器跑,客戶端只剩演出。
- 遊戲在 `window.__otty` 暴露唯讀狀態(dam progress、timer、entities),Playwright 用它斷言,不必解析像素。
- E2E 由 agent 透過 **Playwright MCP** 執行:啟動 `npm run dev` → navigate → 操作(鍵盤事件)→ 讀 `window.__otty` + 截圖比對。每個 Phase 的 exit criteria 都含至少一條 Playwright 驗證。**MCP 修好後,agent 可直接在 sandbox 跑 E2E**(不再受限於「沙盒裝不了瀏覽器、首跑只能靠本機/CI」)。

---

## 3. 美術資產

### 3.1 現有資產盤點(`Assets/`,2026-07-02)

| 檔案 | 尺寸 | 幀 | 對應動作 |
|---|---|---|---|
| A. 待機 Idle | 2508×627 | 4 (627²) | idle |
| B. 走路 Walk | 2508×627 | 4 (627²) | walk |
| C. 搬運 Carry | 2508×627 | 4 (627²) | carry |
| D. 樹枝突刺 Poke | 2172×724 | 3 (724²) | poke |
| E. 吃魚 Eat Fish | 2172×724 | 3 (724²) | eat |
| F. 仰漂拍肚 Float | 2508×627 | 4 (627²) | float |
| G. 蓋水壩 Build | 2172×724 | 3 (724²) | build |
| Character_1 / 2_Action | 1448×1086 | — | 立繪(行銷/UI 用) |

⚠️ **全部是 RGB 無透明度**(淺灰背景),不能直接進 Phaser。

### 3.2 資產管線(pipeline,可寫成腳本 `scripts/prepare-assets.ts`)

1. 去背 → RGBA(背景近純色,color-key + 邊緣羽化即可自動化)
2. 切幀(627² / 724² 網格)→ 縮到遊戲尺寸(基準 128px 高)
3. 打包 texture atlas + 產生 Phaser 動畫 JSON
4. 壓縮驗證:總量計入 **首載 < 3MB** 預算
5. 管線腳本本身要有測試:輸入樣本圖 → 斷言輸出尺寸/透明度/幀數

### 3.3 缺口清單(Graphic Designer backlog)

尚無:樹枝、魚、石頭、三角錐、土塊等道具圖;老鷹、熊;場景(河道、壩址、岸邊 tiles);水壩三階段外觀;UI(進度條、按鈕、虛擬搖桿);10 人辨識方案(色帽/圍巾)。風格以現有水獺為基準(暖色手繪感,接近原計畫 Option A 的圓潤方向)。**程式開發不等美術**:先用幾何色塊 placeholder,資產到位後替換(見 §5 平行泳道)。

---

## 4. 角色與職責 (RACI 精神)

| 角色 | 職責 | 擁有的文件/產出 | 檢查點 |
|---|---|---|---|
| **Stakeholder** (boss) | 定方向、驗收每個 Phase、拍板範圍變更 | 本文件 §1、成功指標 §8 | 每 Phase 結束的 demo(Playwright 錄影/截圖即可異步驗收) |
| **Project Manager** | 維護 TASKS.md/STATE.md、排依賴、控範圍 | `TASKS.md`, `STATE.md` | 每 session 開始/結束 |
| **Developer** | core 邏輯、Phaser 場景、netcode;嚴格 TDD | `src/`, `tests/unit/` | PR 必附測試;綠燈才合併 |
| **Graphic Designer** | §3.3 缺口資產、去背管線輸入、風格一致性 | `Assets/`, 風格指南 | 資產交付即跑管線腳本驗證 |
| **Tester** | E2E 情境、探索性測試、效能(60fps/3MB)、跨裝置 | `tests/e2e/`, bug 回報進 TASKS.md | 每 Phase exit 前全量回歸 |
| **Marketing** | itch.io 頁面、社群素材(用 Character 立繪)、上線推廣 | `marketing/` | Phase 4 起介入,素材可提早平行做 |
| **Maintainer** | CI/CD、依賴升級、伺服器監控、成本 | `.github/workflows/`, 部署設定 | CI 紅燈 24h 內處理 |

單一 agent 可身兼多角,但**每個任務只標一個主責角色**,避免互等。

---

## 5. 開發階段與平行泳道

### 5.1 Phases(exit criteria 全部可自動驗證)

| Phase | 內容 | Exit Criteria(必須全綠) |
|---|---|---|
| **P0 地基** | Vite+Phaser+TS scaffold、Vitest、Playwright smoke、資產管線、CI | `npm test` 綠;Playwright 能開啟空場景截圖;管線輸出合法 atlas;CI 在 push 時全跑 |
| **P1 核心循環**(單機) | 移動、撿/放樹枝、蓋壩進度、倒數、洪水勝負、動畫 A/B/C/G | Playwright 腳本能「玩完一局並獲勝/失敗」;core 覆蓋率 ≥ 90% |
| **P2 完整玩法**(單機) | 全道具、戳/吃魚/漂浮/挖土(D/E/F)、老鷹+熊、AI 水獺、手機操作 | 每個機制各有 unit + 一條 E2E;1 人 + AI 可完整遊玩 |
| **P3 連線** | Colyseus、房間/連結加入、同步、2–10 人 | 兩個 Playwright browser context 同房互動測試通過 |
| **P4 打磨** | 全套正式資產替換 placeholder、音效/BGM、UI、結算 | 60fps on 中階手機模擬;首載 < 3MB;視覺回歸截圖基準更新 |
| **P5 上線** | CF Pages + Fly.io 部署、PWA、itch.io、壓測、行銷發布 | 生產 URL 上 Playwright 冒煙全綠;10 人房壓測通過 |

### 5.2 平行泳道(multi-agent 分工)

不同泳道**檔案邊界不重疊**,多 agent 可同時開工不撞車:

```
泳道                  P0        P1        P2        P3        P4        P5
─────────────────────────────────────────────────────────────────────────
A 核心邏輯 core/      ████████  ████████  ████████  (搬上伺服器)
B 渲染 game/          scaffold  ████████  ████████            ████████
C 測試設施 tests/     ████████  ██ E2E隨功能同步 ██████████████████████
D 資產管線+美術       ████████  ██ 缺口資產可全程平行製作 ████
E 網路 net/                     interface先定義…    ████████
F DevOps CI/CD        ████████                                ████████
G 行銷 marketing/               ██ 立繪素材/頁面文案可提早 ██  ████████
```

- **A 與 B 平行**:core 先有介面與測試,game 層對著介面做演出(placeholder 圖)。
- **D 全程平行**:美術缺口不擋程式;管線讓「資產到→自動進遊戲」。
- **E 提早定介面**:P1 就定義 `GameAdapter`(local vs colyseus 同介面),P3 只是換實作。
- 同一泳道內任務有依賴鏈(見 TASKS.md `deps` 欄),**不同泳道間依賴越少越好**;跨泳道介面變更必須先在 TASKS.md 開任務並通知(寫進 STATE.md 的 Decisions)。

### 5.3 多 Agent 併發規則

1. 認領:在 TASKS.md 填 owner + 時間戳;無 owner 或超過 24h 未更新可接手
2. 一個 agent 一次只 in_progress 一個任務
3. 只改自己泳道的目錄;共用檔(型別定義 `src/core/types.ts` 等)改動需在 STATE.md Decisions 記錄
4. **分支**:一組功能開一個 feature branch(如 `feat/P2-props`),WIP 也 commit 到該 branch;**只有 `npm run check`(typecheck + lint + unit)必綠、且動到玩法的相關 E2E 也綠之後,才合併回 `main`**。`main` 永遠可玩、綠燈
5. **收尾**:每個任務完成須 (a) 更新 TASKS.md 狀態、(b) 更新 STATE.md、(c) 在 `Docs/` 留 `<任務ID>_summary.md` 摘要
6. 中斷時:即使任務未完,也要 commit 到 feature branch + 更新 STATE.md「下一步」

---

## 6. TDD 工作流(所有 Developer 任務適用)

1. 從 TASKS.md 任務的**驗收條件**寫出失敗測試(unit 或 E2E)
2. 最小實作到綠燈
3. 重構(測試保持綠)
4. `npm run check` 全綠 → 更新任務狀態 → commit

測試金字塔:**多數在 `core/` unit**(快、穩),Phaser 場景做薄整合測試(場景能載入、動畫已註冊),**每個玩家可感知功能至少一條 Playwright E2E**。E2E 用 `window.__otty` 斷言狀態、截圖存 `tests/e2e/__screenshots__/` 做視覺回歸。

## 7. 品質門檻 (Definition of Done)

任務級:測試先行且全綠、typecheck/lint 過、不破壞其他泳道、TASKS.md+STATE.md 已更新、`Docs/<任務ID>_summary.md` 摘要已寫、功能在 feature branch 上測綠後才併入 `main`。
Phase 級:exit criteria 全綠、Stakeholder 驗收(demo 截圖/錄影)、無 P1 級 bug、效能預算內(60fps、首載 < 3MB)。

## 8. 成功指標(上線後 30 天,沿用 v0.1)

一局完成率 > 70%、每 session 局數 ≥ 3、邀請連結轉化 > 40%、手機玩家占比 ≥ 30%。

## 9. 風險與對策(更新)

| 風險 | 對策 |
|---|---|
| 資產無透明度/規格不一(627 vs 724) 