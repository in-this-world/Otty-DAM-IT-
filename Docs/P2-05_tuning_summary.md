# P2-05 tuning — AI slow-down + path smoothing + Playwright status

## 觸發
Boss 回報:AI「移動太快」、遊戲有 bug;要求可調慢 AI、並讓 Playwright E2E 能跑。

## 用 headless playtest 找 bug(無瀏覽器下的手段)
寫了一支 harness:用真正的 `LocalAdapter` + `planOtterCommands`(等同 GameScene.driveAi),人類發呆、AI 跑整局,收集每獺:移動距離、平均速度、撿/建/掉次數、**換向次數**、漂浮 ticks。
- **發現的 bug**:AI 朝斜向目標時**每 1~2 tick 就換向**(dominant-axis 每 tick 重算 → 樓梯狀鋸齒),整局換向 **~200~360 次**,看起來狂抖、亂竄——這正是「太快/有問題」的觀感來源。

## 修正
1. **路徑平滑**(`src/core/ai.ts` 新增 `stepToward`,固定「先走完水平軸再走垂直軸」+ `AI_AXIS_DEADBAND=16`):換向降到 **~50~70 次/局**(4~5× 改善),走成乾淨的 L 形,像有目的的工人。`directionToward` 保留(其單元測試不動)。
2. **可調慢 AI**:
   - core `createInitialState` 新增泛用 `speedByOtter?: Record<id, speed>`(不特指 AI,乾淨);otter factory 依此覆寫 `speedPerSec`。
   - `?aiSpeed=<pct>`(10..100)參數;GameScene 預設 `DEFAULT_AI_SPEED_PCT=55` → AI 110 u/s(人類 200 的一半),對 `otter-2..N` 套 `speedByOtter`。
   - playtest 驗證:AI ~100 u/s、整局仍在 ~65s 內完壩(遠早於 180s),換向維持低檔。

## Playwright / 瀏覽器 E2E 狀態(未能於本 sandbox 跑)
- Playwright 自帶 Chromium 下載被網路 allowlist 擋(403);sandbox 無 root、不能 apt 裝 chromium;claude-in-chrome MCP 目前**沒有連線的瀏覽器**。三條路都不通,故本 session 無法實跑瀏覽器 E2E。
- 已做的把握:`npm run check`(159 綠)+ `vite build` 綠 + headless playtest(真 adapter 路徑蓋壩獲勝)。
- **給 boss 的跑法**(你的機器沒有此限制):`npx playwright install chromium` 後 `npm run e2e`;或在 Chrome 裝擴充並連線,我下個 session 可用瀏覽器 MCP 實跑並補 linux 基準截圖。

## 測試
- 新增:`stepToward` 2 條、`state.speedByOtter` 1 條、`params.aiSpeed` 1 條。
- `npm run check` 全綠:**159 測試**。tsc + eslint 乾淨。

## 後續注意
- `directionToward` 現僅測試在用(production 改用 `stepToward`);保留為 API。
- AI 仍無避坑/不撿道具;斜向走 L 形(非對角),屬 4 向輸入的自然結果。
- 預設補 2 隻 AI、`aiSpeed=55%`;若要更難/更易可調 `?ai=` / `?aiSpeed=`。
