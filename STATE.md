# STATE — Project Otty, DAM IT!

> 每次 session 結束前必須更新本檔。新 agent 從這裡開始。

## 最後更新
2026-07-03 · by Claude(流程更新:E2E 可在 sandbox 由 agent 跑〔MCP 已修〕、每任務留 `Docs/` 摘要、feature branch → 測綠才併 `main`)
2026-07-02 · by Claude (wave 4: P0-02 收尾、P2-01 道具、P1-08 完整一局 E2E)

## 專案現況
- **P0 完成(含本機 E2E 3/3 綠 + win32 基準)、P1 一局可玩、P2-01 道具核心完成。** `npm run check` 綠:118 測試全過。
- GitHub remote:https://github.com/in-this-world/Otty-DAM-IT-(已 push;**Actions 尚未看到 run,待排查**)。
- 遊戲可跑:`npm run dev` → Boot(atlas+動畫註冊)→ GameScene:1P + 撒滿樹枝的場地,WASD/方向鍵移動、E/空白鍵撿放、B 建造、180s 倒數、勝負 overlay、R 重開。
- git repo 已建(main,7 commits,任務 ID 開頭)。**分支策略(新):每組功能開 feature branch(如 `feat/P2-props`),測試全綠才併回 `main`;`main` 永遠保持可玩、綠燈。** **注意:repo 在 sandbox 開發後同步回本資料夾,Windows 端首次使用建議 `git status` 確認(可能有 CRLF 造成的假差異,`git add --renormalize .` 可解)。**

## 已有的東西
- `src/core/` — 純邏輯全套:movement/inventory/dam/timer + command→state→events + LocalAdapter(20Hz,可注入時鐘)。需求曲線 `round(20×n^0.85)`、合作加成 `1+0.25×(k-1)`。
- `src/game/` — BootScene(atlas 載入+動畫註冊)、GameScene(演出+輸入+HUD+`window.__otty`)。輸入映射/動畫註冊/HUD 格式化都是純模組,已單測。
- `scripts/` — 資產管線(去背→切幀→128px→atlas):`public/assets/` otter.png 346KB + json,7 動作 25 幀,總量 ~355KB(遠低於 3MB 預算)。
- `tests/` — unit 88 條綠;e2e 3 條(smoke + hud×2)已寫,**MCP 修好後可由 agent 在 sandbox 直接跑**(待首跑 + 補基準截圖)。
- `.github/workflows/ci.yml` — check + e2e 雙 job,**待 GitHub remote 首跑**。
- `marketing/` — itch.io 草稿 + 中英 pitch(P1-09),待 Stakeholder 過目。
- `Docs/` — 每任務一份摘要(P0-01…P1-09)。

## 下一步(建議順序)
0. **開 feature branch 再動工**(如 `feat/e2e-run`);完成且測綠才併回 `main`。任務結束記得補 `Docs/<ID>_summary.md`。
1. **跑 E2E(`npm run e2e`,預期 5 tests):MCP 已修好,agent 現在可直接在 sandbox 用瀏覽器 MCP 跑**,驗證 P0-02(smoke + HUD)與 P1-08 完整一局 bot(win + lose)。綠了把 P0-02、P1-08 標 done 並補基準截圖。
2. **CI 排查**(P0-05):repo → Actions tab;若顯示停用 → Settings→Actions→General 開啟;若無 run → push 任一新 commit 觸發。首跑 e2e job 會因缺 linux 基準截圖紅(預期),照 Docs/P0-02_P0-05_summary.md 補基準。
3. `ready` 可認領:P2-02(戳人,applyStun 已備好)、P2-03(漂浮)、P2-05(AI 水獺)、P2-08(美術缺口第一批,需真人美術)。

## Decisions log(跨泳道決策記錄於此)
- 2026-07-02:採 command→state→events + GameAdapter 介面,單機/連線共用 core(MASTER_PLAN §2.1)
- 2026-07-02:美術風格以現有水獺為基準(暖色手繪),原 Option A/B/C 討論結案
- 2026-07-02:**型別擴充(additive)**:`OtterState.vel/wantsBuild`、`GameState.world`、`DamState.site`、`gameWon/gameLost` 事件附 `scores`。
- 2026-07-02:需求曲線 `required = round(base × n^0.85)`(次線性);同 tick 多人建造加成 `×(1+0.25(k-1))`;達標即刻獲勝。
- 2026-07-02:drop 會令水獺當 tick 停下(物品準確落腳邊);預設開局撒 2×required 樹枝(seed 決定)。
- 2026-07-02:E2E 契約 `window.__otty = { ready, tick, phase, timerMs, dam, otters, itemsOnGround, items[] }`(src/game/snapshot.ts)。
- 2026-07-02:URL 測試鉤子 `?seed&freeze&timer&required`(src/game/params.ts),僅供 E2E/除錯。
- 2026-07-02:P2-01 數值:魚 ×1.5 速 5s、丟魚暈 2s(射程 160/命中 40)、石頭負重 ×0.5 但建造 +3、`noBranch`→`noBuildMaterial`、坑半徑 32/暈 1.5s/挖掘者寬限 2s;開局散布每第 8 個魚、第 8n+4 個石頭。

## 已知問題 / 注意
- Assets 檔名含中文與空格,管線腳本處理路徑要加引號
- 幀規格不一(627² ×4 vs 724² ×3),管線已支援兩種網格
- **E2E 待首跑**:先前 sandbox 裝不了 Playwright 瀏覽器(CDN 被擋);**MCP 已修好,agent 現可在 sandbox 用瀏覽器 MCP 直接跑 E2E**,首跑後補 linux 基準截圖
- Vite build 有 >500KB chunk 警告(Phaser 本體),P4 再做 code-split;首載預算屆時驗證
- 去背管線:羽化邊緣無 matte decontamination、固定 tolerance 26(詳 Docs/P0-03_summary.md)
