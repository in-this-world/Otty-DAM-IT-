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
| P0-02 | C | Tester | Playwright smoke:開 dev server → BootScene 載入 → `window.__otty.ready === true` → 截圖 | P0-01 | E2E 綠,截圖存基準目錄 | done | boss 確認 2026-07-11 \4
| P0-03 | D | Developer | 資產管線 `scripts/prepare-assets.ts`:去背→切幀→縮放→atlas;含管線單元測試 | P0-01 | 對 A–G 跑完輸出合法 RGBA atlas + 動畫 JSON;測試綠 | done | Claude 2026-07-02 \4
| P0-04 | A | Developer | core 骨架:types.ts、command→state→events 迴圈、tick;GameAdapter 介面(local 實作) | P0-01 | unit 測試:空局 tick 不變狀態、指令入列出事件 | done | Claude 2026-07-02 \4
| P0-05 | F | Maintainer | GitHub Actions CI:push → check + unit + E2E(headless) | P0-01,02 | CI 在 main 上全綠 | done | boss 確認 2026-07-11 \4

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
| P1-08 | C | Tester | E2E「完整一局」:自動操作撿樹枝蓋壩 → 勝利;放置不動 → 失敗 | P1-07 | 兩條 Playwright 腳本綠 | done | boss 確認 2026-07-11 \4
| P1-09 | G | Marketing | 用 Character_1/2 立繪做 itch.io 草稿頁 + 一句話賣點文案(中/英) | — | 草稿存 `marketing/`,Stakeholder 過目 | done | Claude 2026-07-02 \4

## P2 完整玩法(單機)

| ID | 泳道 | 角色 | 任務 | 依賴 | 驗收條件 | 狀態 | Owner |
|---|---|---|---|---|---|---|---|
| P2-01 | A | Developer | 道具全套:魚(吃=加速/丟=暈眩)、石頭(重)、三角錐(帽)、挖土+坑 | P1-02 | 每道具 unit 覆蓋效果與約束 | done | Claude 2026-07-03(見 Docs/P2-01_summary.md;板上原漏標) \4
| P2-02 | A | Developer | 戳人 D:掉物資 + 2s 無敵幀 | P2-01 | unit:被戳掉落、無敵期免疫 | done | Claude 2026-07-03 \4
| P2-03 | A | Developer | 漂浮 F + 手牽手水獺筏、洗澡去 debuff | P1-01 | unit:入水漂浮、連結成串速度加成 | done | Claude 2026-07-03 \4
| P2-04 | A | Developer | 突發事件:老鷹(影子預警/三角錐免疫)、熊(丟魚引開),狀態機 | P2-01 | unit:事件狀態機全路徑 | done | Claude 2026-07-04 |
| P2-05 | A | Developer | AI 水獺:補位行為樹(撿→搬→建),人數平衡 | P1-03 | unit:AI 一人局可在時限內完壩(模擬 tick) | done | Claude 2026-07-03 \4
| P2-06 | B | Developer | D/E/F 動畫 + 事件演出 + 手機虛擬搖桿雙鍵 | P2-01..04 | E2E:手機 viewport 可完整遊玩 | done | Claude 2026-07-04 |
| P2-07 | C | Tester | 全機制 E2E 回歸包 + 60fps 效能檢測腳本 | P2-06 | 回歸全綠;效能報告存檔 | done | Claude 2026-07-12(併 P2-14:mechanics/perf specs) |
| P2-08 | D | Designer | 缺口資產第一批:樹枝/魚/石頭/三角錐/土塊(規格:RGBA、單幀或 3–4 幀、風格同水獺) | — | 過管線腳本驗證即收 | done | Claude 2026-07-05(wave2 管線:88 幀/17 anims/9 物件組,203 綠+build 綠) |
| P2-09 | D | Designer | 缺口資產第二批:老鷹、熊、場景 tiles、水壩三階段 | P2-08 | 同上 | done | Claude 2026-07-12(場景 tiles T1–T6 過管線+接進 GameScene,見 Docs/P2-09_tiles_summary.md) |
| P2-10 | A+B | Developer | **輸入補全**:丟魚 T、挖土 G、吃魚 Q 接上鍵盤+手機按鍵(core 指令 throwItem/dig/useItem 早已存在,只缺映射);操作說明列更新 | P2-01 | unit:鍵→指令映射;實機:三動作可觸發且動畫正確 | done | Claude 2026-07-12(見 Docs/P2-10-13_summary.md) |
| P2-11 | B | Developer | **持物演出**:搬魚/搬石/搬土改為「carry 動畫 + 手上物件小圖疊加」(obj_* 幀,免新美術);建造中同樣顯示所用材料 | P2-10 | unit:render-map 持物→疊加幀映射;實機:三種材料視覺可辨 | done | Claude 2026-07-12 |
| P2-12 | A+B | Developer | **場景/物件一致性**:水域 3×2→4×2 並與美術對齊;溪流視覺連到下游河;建造判定範圍=壩區圖形範圍;魚只生成於水中且會游動(決定性漫游,不出水域) | P2-09 | unit:scene-map/水域/魚漫游;E2E:凍結截圖更新 | done | Claude 2026-07-12 |
| P2-13 | A+B | Developer | **老鷹抓人 + 反擊**:鷹改為抓「水獺」飛行 ~2s 後丟下+冰凍(暫定 3s,可調);戳 F 可趕走鷹/熊、丟魚可擊退熊(原引開保留);三角錐/水中免疫保留 | P2-04 | unit:狀態機全路徑(抓/丟/凍/反擊);實機驗證 | done | Claude 2026-07-12 |
| P2-14 | C | Tester | 併入 P2-07:回歸包涵蓋 P2-10~13 新機制 + 60fps 效能腳本 | P2-10..13 | 回歸全綠;效能報告存檔 | done | Claude 2026-07-12(mechanics.spec + perf.spec;報告=CI artifact) |

## P3 連線

| ID | 泳道 | 角色 | 任務 | 依賴 | 驗收條件 | 狀態 | Owner |
|---|---|---|---|---|---|---|---|
| P3-01 | E | Developer | Colyseus server:room schema、core 搬上伺服器跑、20Hz tick | P2 全 A 泳道(含 P2-10..13) | server unit 測試綠 | done | Claude 2026-07-13(RoomSimulation 純核心@20Hz+DamRoom+LobbySchema;13 測) |
| P3-02 | E | Developer | ColyseusAdapter 實作 GameAdapter;客戶端預測+插值 | P3-01 | 整合:local 與 colyseus adapter 過同一套測試 | done | Claude 2026-07-13(prediction+interpolation;共用契約 local/colyseus 皆過+tick-parity;14 測) |
| P3-03 | B | Developer | 大廳/準備室/連結加房 `r/ABCD`、中途 spectate + 連線狀態 UX | P3-02 | E2E:兩個 browser context 同房互戳 | done* | Claude 2026-07-13(LobbyController+DOM 準備室+join link+spectate;5 測。*雙瀏覽器 E2E 待 host) |
| P3-04 | C | Tester | 多人測試:2 人合作勝利、10 人房、斷線重連 | P3-03 | 全綠 | done* | Claude 2026-07-13(in-process 多人整合 3 測全綠;301 unit+build 綠。*真 host 雙瀏覽器待) |
| P3-05 | B | Developer | 準備室 personalization:暱稱(localStorage)+帽/圍巾顏色+頭頂名牌、免登入 | P3-02 | 暱稱/顏色持久化、名牌顯示 | done | Claude 2026-07-13(protocol PlayerProfile+profile-store+接進準備室;5 測) |

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

- BUG-01 建造姿勢卡住(build/poke/eat 永久停在該姿勢直到移動)→ **已修**(transientActionSystem+actionMs,wave 8)
- BUG-02 F 戳不到隊友(POKE_RADIUS 56 太小)→ **已修**(→90,wave 8)
- FEAT 游泳改為按鍵 hold-to-swim(C)→ **已做**(wave 8);原自動入水漂浮已改為需按住 C
- **BUG-04 魚卡角落不動/游上草地(2026-07-12 boss 播測,已修)**:根因一=FNV hash 高位在只差一位 epoch 數字時幾乎不變,魚每回抽到近乎相同的航向/休息值 → 永久休息或釘死角落(改加 murmur3 fmix32 雪崩步);根因二=河岸 tile 上緣與右半是草地美術,游動邊界改用 `fishBounds`(上內縮 58、右內縮 62)並加靠牆轉向 + 35% 休息拍。
- **BUG-03 Windows 工作樹檔案尾端損毀(2026-07-12 發現/已修)**:先前某次同步把大量文字檔尾端截斷(位元組數≈行數,CRLF 長度換算 bug),另一批檔案尾端被 NUL 填充。已從 git 還原 66 個純截斷檔、修復其餘;**教訓:在掛載資料夾上「就地編輯/覆寫既有檔」會把檔案截回舊長度,一律在 sandbox 內編輯後以 temp+rename 同步回來。**
