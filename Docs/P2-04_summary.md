# P2-04 摘要:突發事件(老鷹 + 熊)狀態機

**任務**:突發事件——🦅 老鷹(影子預警 / 三角錐免疫)、🐻 熊(丟魚引開),狀態機。
**驗收**:unit:事件狀態機全路徑。**狀態**:done(feature branch `feat/P2-04-hazards`,測綠併回 main)。

## 做了什麼

新增純邏輯模組 `src/core/hazards.ts`,兩個小型狀態機,由新 `hazardSystem` 每 tick 推進(接進 `defaultSystems`,排在 effects 之後、dam 之前——先結算被熊撞掉的 `wantsBuild`,再讓 dam 消化本 tick 的建造)。無 Phaser、無真實時鐘,`state.timerMs` 驅動排程、注入的 `dtMs` 驅動狀態機,P3 可原封不動搬上伺服器。

### 🦅 老鷹 `EagleState`(warning → swoop → 消失)
- `spawnEagle`:挑目標(優先「手上有東西」的水獺,id 排序決定,可測)→ 進 `warning`,計時 `EAGLE_WARNING_MS=3000`(影子預警 3 秒),影子壓在目標身上,發 `eagleWarning`。
- `warning` 每 tick:影子追著目標當前位置移動;計時歸零 → 進 `swoop`。
- swoop 結算:目標**戴三角錐**(`hat==='cone'`)或**在水裡漂浮**(`floating===true`)或**空手 / 已離場** → `eagleSwooped grabbed=false`,不搶;否則把手上物資**叼走**(從世界移除,清 `carrying`),`eagleSwooped grabbed=true itemId`。
- `swoop` 播 `EAGLE_SWOOP_MS=400` 的俯衝/離場後移除。

### 🐻 熊 `BearState`(approach → leaving → 消失)
- `spawnBear`:從林邊(上緣中央 `{x:width/2,y:0}`)走出,進 `approach`,壽命 `BEAR_LIFETIME_MS=12000`,發 `bearAppeared`。
- `approach` 每 tick:**地上的魚優先**(`nearestGroundFish`)→ 朝魚走,`BEAR_EAT_RADIUS=40` 內吃掉 → 被引開,進 `leaving`,發 `bearLured`。沒有魚才追**最近的水獺**;`BEAR_HIT_RADIUS=44` 內拍飛:掉物資(落在腳邊)+ `BEAR_STUN_MS=1500` 暈眩(`cause:'bear'`,新增之 `StunCause`)+ 擊退 `BEAR_KNOCKBACK=48`,發 `bearHitOtter` / `otterStunned`;拍完**繼續遊蕩**。壽命歸零 → 進 `leaving`。
- `leaving`:朝上緣走離場,`BEAR_LEAVE_MS=2500` 後移除,發 `bearLeft`。
- 只鎖定 `stunnedMs===0` 的水獺(`liveOtters`),不重複拍已倒地者。
- **引開對策為湧現行為**:`throwItem` 已會把魚丟到地上(P2-01),熊自動優先追最近的魚 → 丟遠處即可把牠引走。

### 排程器(`createInitialState`,`GameConfig.hazards`)
- 預設**不開**(省略 `hazards` → `state.hazards` 為 undefined,現有回合/測試完全不受影響;`hazardSystem` 對無 hazards 或全閒置狀態回傳原 state,維持 structural-sharing)。
- `hazards.enabled`:用 seed 決定性排 1–2 次事件,落在回合中段 60%(20%–80%),種類由 seed 決定。
- `hazards.schedule`:明確指定 `{kind, atElapsedMs}`,轉成 `atTimerMs = timerMs - atElapsedMs`,依「回合內先發」排序(atTimerMs 降序)。測試 / 腳本用。
- 事件到期(`state.timerMs <= atTimerMs`)且對應欄位空著才生成;槽位被佔就留到下 tick 重試。

### types.ts
- 新增 `HazardKind / EagleState / BearState / HazardSpawn / HazardsState`,`GameState.hazards?`。
- `StunCause` 加 `'bear'`。
- 新事件:`eagleWarning / eagleSwooped / bearAppeared / bearHitOtter / bearLured / bearLeft`。

## 關鍵決策
- **hazards 預設關閉**:避免動到既有 168 綠測 / 現行 GameScene 玩法;開關全在 config。接進遊戲迴圈(spawn 排程 + 演出)屬 P2-06(B 泳道)。
- **老鷹「叼走」而非「掉落」**:物資直接離場(被抓走飛走),與 poke/熊的「掉在腳邊」區隔;演出層可據事件放不同動畫/音效。
- **引開用湧現而非特例**:熊只認「最近的魚」,不寫死指令,丟魚引開自然成立。
- **目標選擇決定性**(不吃 rng),排程才吃 rng——狀態機本身好測、可重播。

## 測試結果
- 新增 `tests/unit/core/hazards.test.ts`:**18 條**,涵蓋兩台狀態機全路徑(老鷹 8:選標/生成/影子跟隨/搶到/三角錐免疫/水中閃避/空手/俯衝消失;熊 7:生成/拍飛+暈+擊退/被魚引開/魚優先於水獺/壽命到走人/離場消失;排程 4:無 hazards no-op、schedule 轉換排序、隨機決定性、reduce() 全流程 warning→swoop 搶物)。
- `npm run check`(tsc --noEmit + eslint + vitest):**186 綠**(168 + 18);`vite build` 綠。

## 後續 / 交棒
- **P2-06**:把 hazards 接進 `GameScene`(開排程、影子/老鷹/熊 placeholder 演出、SFX),補一條 E2E(手機 viewport 亦可)。
- 平衡待實測:老鷹頻率、熊速度(現 120 u/s,比水獺 200 慢)、暈眩秒數。
- 資產(P2-08/09):老鷹、熊、影子預警圖仍缺,現以事件驅動、演出層先用色塊 placeholder。
