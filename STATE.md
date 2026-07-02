# STATE — Project Otty, DAM IT!

> 每次 session 結束前必須更新本檔。新 agent 從這裡開始。

## 最後更新
2026-07-02 · by Claude (implementation session, waves 1–3, multi-agent)

## 專案現況
- **P0 落地、P1 單機一局可玩(程式面)。** `npm run check` 綠:88 unit/整合測試全過。
- 遊戲可跑:`npm run dev` → Boot(atlas+動畫註冊)→ GameScene:1P + 撒滿樹枝的場地,WASD/方向鍵移動、E/空白鍵撿放、B 建造、180s 倒數、勝負 overlay、R 重開。
- git repo 已建(main,7 commits,任務 ID 開頭)。**注意:repo 在 sandbox 開發後同步回本資料夾,Windows 端首次使用建議 `git status` 確認(可能有 CRLF 造成的假差異,`git add --renormalize .` 可解)。**

## 已有的東西
- `src/core/` — 純邏輯全套:movement/inventory/dam/timer + command→state→events + LocalAdapter(20Hz,可注入時鐘)。需求曲線 `round(20×n^0.85)`、合作加成 `1+0.25×(k-1)`。
- `src/game/` — BootScene(atlas 載入+動畫註冊)、GameScene(演出+輸入+HUD+`window.__otty`)。輸入映射/動畫註冊/HUD 格式化都是純模組,已單測。
- `scripts/` — 資產管線(去背→切幀→128px→atlas):`public/assets/` otter.png 346KB + json,7 動作 25 幀,總量 ~355KB(遠低於 3MB 預算)。
- `tests/` — unit 88 條綠;e2e 3 條(smoke + hud×2)**已寫未跑**(sandbox 無瀏覽器)。
- `.github/workflows/ci.yml` — check + e2e 雙 job,**待 GitHub remote 首跑**。
- `marketing/` — itch.io 草稿 + 中英 pitch(P1-09),待 Stakeholder 過目。
- `Docs/` — 每任務一份摘要(P0-01…P1-09)。

## 下一步(建議順序)
1. **人工驗證**:本機 `npm run dev` 玩一局;`npx playwright install chromium` 後 `npm run e2e`,用 `--update-snapshots` 建基準截圖(P0-02 收尾)。
2. 建 GitHub remote、push,看 CI 首跑(P0-05 收尾;e2e job 首跑會因無 linux 基準截圖紅,按 Docs/P0-02_P0-05_summary.md 處理)。
3. `ready` 可認領:P1-08(完整一局 E2E)、P2-01(道具)、P2-03(漂浮)、P2-05(AI 水獺)、P2-08(美術缺口第一批)。

## Decisions log(跨泳道決策記錄於此)
- 2026-07-02:採 command→state→events + GameAdapter 介面,單機/連線共用 core(MASTER_PLAN §2.1)
- 2026-07-02:美術風格以現有水獺為基準(暖色手繪),原 Option A/B/C 討論結案
- 2026-07-02:**型別擴充(additive)**:`OtterState.vel/wantsBuild`、`GameState.world`、`DamState.site`、`gameWon/gameLost` 事件附 `scores`。
- 2026-07-02:需求曲線 `required = round(base × n^0.85)`(次線性);同 tick 多人建造加成 `×(1+0.25(k-1))`;達標即刻獲勝。
- 2026-07-02:drop 會令水獺當 tick 停下(物品準確落腳邊);預設開局撒 2×required 樹枝(seed 決定)。
- 2026-07-02:E2E 契約 `window.__otty = { ready, tick, phase, timerMs, dam, otters, itemsOnGround }`(src/game/snapshot.ts)。

## 已知問題 / 注意
- Assets 檔名含中文與空格,管線腳本處理路徑要加引號
- 幀規格不一(627² ×4 vs 724² ×3),管線已支援兩種網格
- **E2E 未實跑**:開發 sandbox 裝不了 Playwright 瀏覽器(CDN 被擋),首跑靠本機或 CI
- Vite build 有 >500KB chunk 警告(Phaser 本體),P4 再做 code-split;首載預算屆時驗證
- 去背管線:羽化邊緣無 matte decontamination、固定 tolerance 26(詳 Docs/P0-03_summary.md)
