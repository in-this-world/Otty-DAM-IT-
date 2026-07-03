# STATE — Project Otty, DAM IT!

> 每次 session 結束前必須更新本檔。新 agent 從這裡開始。

## 最後更新
2026-07-03 · by Claude (wave 7:AI 調校——路徑平滑〔stepToward,換向 ~200→~55〕+ 可調慢 AI〔speedByOtter + ?aiSpeed,預設 55%=110u/s〕;headless playtest 找 bug;Playwright 瀏覽器於 sandbox 不可跑〔CDN 擋+無 root+無連線 Chrome〕。`npm run check` 159 綠 + build 綠)
2026-07-03 · by Claude (wave 6:P2-02 戳人〔命中+掉物+2s 無敵幀+F 鍵〕真正實作;P2-03 water + P2-05 AI 接進 GameScene 遊戲迴圈〔?ai=N,預設補 2 隻〕;`npm run check` 155 測試全過、`vite build` 綠)
2026-07-03 · by Claude (wave 5 平行:P2-03 漂浮/水獺筏/洗澡去 debuff + P2-05 AI 水獺行為樹,兩支 feature branch 並行開發、測綠併回 main;`npm run check` 145 測試全過)
2026-07-03 · by Claude(流程更新:E2E 可在 sandbox 由 agent 跑〔MCP 已修〕、每任務留 `Docs/` 摘要、feature branch → 測綠才併 `main`)
2026-07-02 · by Claude (wave 4: P0-02 收尾、P2-01 道具、P1-08 完整一局 E2E)

## 專案現況
- **P0 完成(含本機 E2E 3/3 綠 + win32 基準)、P1 一局可玩、P2-01 道具核心完成。** `npm run check` 綠:**159 測試全過**。**P2-02(戳人)真正實作完成;P2-03(漂浮/水獺筏/洗澡)、P2-05(AI 水獺補位)已接進 GameScene 遊戲迴圈。**
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
3. `ready` 可認領:剩 P2-08(美術缺口第一批,需真人美術)。P2-02/P2-03/P2-05 皆已完成並接線(見 Docs)。
4. **E2E 首跑**(唯一主要待辦):`npm run e2e` 用瀏覽器 MCP 首跑,補 linux 基準截圖;E2E 已 pin `?ai=0` 維持單獺確定性。
5. **P2-06/P2-08 打磨**:戳人/漂浮/水獺筏專屬動畫+事件演出、手機虛擬搖桿;缺口美術第一批。

## Decisions log(跨泳道決策記錄於此)
- 2026-07-02:採 command→state→events + GameAdapter 介面,單機/連線共用 core(MASTER_PLAN §2.1)
- 2026-07-02:美術風格以現有水獺為基準(暖色手繪),原 Option A/B/C 討論結案
- 2026-07-02:**型別擴充(additive)**:`OtterState.vel/wantsBuild`、`GameState.world`、`DamState.site`、`gameWon/gameLost` 事件附 `scores`。
- 2026-07-02:需求曲線 `required = round(base × n^0.85)`(次線性);同 tick 多人建造加成 `×(1+0.25(k-1))`;達標即刻獲勝。
- 2026-07-02:drop 會令水獺當 tick 停下(物品準確落腳邊);預設開局撒 2×required 樹枝(seed 決定)。
- 2026-07-02:E2E 契約 `window.__otty = { ready, tick, phase, timerMs, dam, otters, itemsOnGround, items[] }`(src/game/snapshot.ts)。
- 2026-07-02:URL 測試鉤子 `?seed&freeze&timer&required`(src/game/params.ts),僅供 E2E/除錯。
- 2026-07-02:P2-01 數值:魚 ×1.5 速 5s、丟魚暈 2s(射程 160/命中 40)、石頭負重 ×0.5 但建造 +3、`noBranch`→`noBuildMaterial`、坑半徑 32/暈 1.5s/挖掘者寬限 2s;開局散布每第 8 個魚、第 8n+4 個石頭。

- 2026-07-03:**P2-03 漂浮/水獺筏**:additive 型別 `Rect`、`OtterState.floating?/raftLinks?`、`GameState.water?`(皆 optional,不破舊測);事件 `otterEnteredWater/otterLeftWater/debuffWashedOff/raftFormed`。`floatSystem` 排在 `movementSystem` 之後(看得到本 tick 落點,筏加成下 tick 生效)。數值:link 半徑 64、每 link +15%、總加成上限 ×1.6(常數放 items.ts,`effectiveSpeedPerSec` 為唯一速度來源)。入水清 `stunnedMs`=0(洗澡去 debuff)。
- 2026-07-03:**P2-05 AI 水獺**:純「外部控制器」設計——`planOtterCommands(state, otterId): Command[]` 無狀態(replay/server 安全),餵進既有 `reduce()`,不改任何現有檔、不動型別。行為樹:暈→停;持建材→近壩則 build、否則朝壩移動;持魚→drop;空手→最近自由建材,近則 pickUp、否則靠近;無建材→stop。附 `recommendedAiCount(human,target=4)`。solo AI 用 seed 7 於時限內完壩(驗收綠)。**尚未接進遊戲迴圈**(game-layer 工作)。

- 2026-07-03:**P2-02 戳人**:`applyPoke`——`POKE_RADIUS`=56 內最近他獺掉手上物品(落腳邊)+ 得 `POKE_INVULN_MS`=2000 無敵(掛在受害者、防連續騷擾);無敵中彈開不掉物。additive `OtterState.invulnMs?`,於 effects 逐 tick 衰減。輸入鍵 **F**(D 已右移)。不加暈眩(僅掉物+無敵)。
- 2026-07-03:**P2-03/P2-05 接線**:GameScene 傳 `water`(佔位 `{40,372,250,140}`)給 adapter;`driveAi` 每 tick 對非玩家水獺呼叫 `planOtterCommands` 回灌 adapter。AI 數 = `?ai ?? recommendedAiCount(1,3)`=2;`?ai=N`(0..8)覆寫,E2E 全 pin `ai=0`。AI 判定=id≠PLAYER_ID(不進 core 型別)。

- 2026-07-03:**P2-05 AI 調校**:`ai.ts` 新增 `stepToward`(固定先水平後垂直 + `AI_AXIS_DEADBAND=16`)取代 dominant-axis,消除斜向樓梯抖動(換向 ~200→~55)。可調慢:core 泛用 `GameConfig.speedByOtter`;`?aiSpeed=%`(10..100),GameScene 預設 `DEFAULT_AI_SPEED_PCT=55`(AI 110u/s,人類 200 一半)。playtest 驗證仍能於時限內完壩。

## 已知問題 / 注意
- Assets 檔名含中文與空格,管線腳本處理路徑要加引號
- 幀規格不一(627² ×4 vs 724² ×3),管線已支援兩種網格
- **E2E 待首跑**:先前 sandbox 裝不了 Playwright 瀏覽器(CDN 被擋);**MCP 已修好,agent 現可在 sandbox 用瀏覽器 MCP 直接跑 E2E**,首跑後補 linux 基準截圖
- Vite build 有 >500KB chunk 警告(Phaser 本體),P4 再做 code-split;首載預算屆時驗證
- 去背管線:羽化邊緣無 matte decontamination、固定 tolerance 26(詳 Docs/P0-03_summary.md)

## 待決 / 給 boss 的問題(更新:2026-07-03 wave 7)
1. ✅ 已解決 — 「AI 太快/亂抖」:已平滑路徑(換向 ~4-5× 少)並可調慢(預設 55%);`?ai=N`、`?aiSpeed=%` 可再調。
2. **Playwright 瀏覽器 E2E 於此 sandbox 不可跑**:Playwright Chromium 下載被 allowlist 擋(403)、無 root 不能 apt、claude-in-chrome 目前無連線瀏覽器。→ 在**你的機器**上 `npx playwright install chromium` 後 `npm run e2e`(specs 已 pin `?ai=0`);或裝 Chrome 擴充並連線,下個 session 我用瀏覽器 MCP 實跑並補 linux 基準截圖。目前回歸靠 `npm run check`(159)+`vite build`+headless playtest。
3. **AI 難度/水域**:預設 2 隻 AI、55% 速;水域仍佔位座標。要調預設或等正式關卡?
4. **handoff**:本 wave 已直接把 commit 寫進你的 `.git`(pack + refs/heads/main),並更新 `repo.bundle`。Windows 端 `git reset --hard main` 同步工作樹後即可 `git push`。
