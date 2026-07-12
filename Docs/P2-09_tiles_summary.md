# P2-09(收尾)場景 Tiles — 任務摘要

**日期**:2026-07-12 · **Owner**:Claude(boss 提供素材)

## 做了什麼
- **管線第三波**(`scripts/lib/tiles.ts` + pipeline 1c 段):T1–T5 全幅場景 tile(草地4變體/水面4幀流動/河岸4向/河床2款/林緣3款)→ 每張輸出一條 `public/assets/tiles/<key>.png` strip + `tiles.json` manifest。**不去背、不進 otter 圖集**(strip 避免圖集 padding 在無縫拼接時漏縫)。白色格線溝槽用 content-aware `whiteMargins` 修掉,再內縮 2% 去掉 AI 圖的邊緣暗角(否則拼起來有格線)。
- **T6 裝飾**(蘆葦/樹樁/苔石/蘑菇)走既有物件管線 → `obj_decor_0..3` 進圖集。`resolveOne` 改「唯一前綴優先」(否則 `1. ` 會同時命中 `T1. …`)。
- **純佈局模組 `src/game/scene-map.ts`**(零 Phaser):草地網格(90% 素草+花/石/禿斑雜訊,cell hash 決定性)、左下水域含岸邊過渡(直邊/轉角,flipX 鏡射)、壩下河床墊(148px,藏在壩體後)、頂部森林牆(留壩位缺口;frame 1 樹叢入口=熊出場處)、5 個裝飾擺位。**`WATER_RECT` 對齊 tile 網格 {0,384,288,156} 並取代舊佔位水域——玩法邊界與畫面一致了**。
- **接線**:Boot 載 5 條 strip spritesheet;GameScene `createBackground()`(無 tile 材質時退回舊色塊,測試安全)、水面 4 幀循環 450ms(`?freeze` 固定第 0 幀保 E2E 決定性)。
- **美術複審(live 網站截圖)**:修掉兩個問題——河床原 236px 大藍板浮在草地上(→148px 塞壩底)、草地格線縫(→邊緣內縮 2%)。

## 測試
`npm run check` 全綠:**245 unit**(+16:whiteMargins 修邊、TILE_MAP、scene-map 佈局規則、tiles.json/圖集契約)+ build 綠 + CI E2E 綠(基準自動重生)。圖集 92 幀;資產總量 ~2.53MB(< 3MB 預算)。

## 後續注意
- **BUG-03(重要)**:Windows 工作樹曾大規模尾端截斷(詳 TASKS.md)。**在掛載資料夾就地編輯/覆寫既有檔會截回舊長度——一律 sandbox 編輯後 temp+rename(rsync)同步**。
- 河岸 tile 的草(偏像素風)與 T1 草(手繪風)色調略異;森林底緣與草地的接縫尚可,P4 打磨可加軟過渡。
- 水面/河岸格數假設寫死在 `TILE_SHEETS`,換素材時契約測試會擋。
