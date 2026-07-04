# P2-06 摘要:手機操作 + 突發事件演出 + D/E/F 動畫接線

**任務**:D/E/F 動畫 + 事件演出 + 手機虛擬搖桿雙鍵。**依賴**:P2-01..04(全 done)。
**驗收**:E2E 手機 viewport 可完整遊玩。**狀態**:done(feature branch,測綠併回 main;E2E 需 CI/本機跑)。

## 做了什麼

### 1. 手機操作(虛擬搖桿 + 動作鍵)
- `src/game/touch.ts`(**純**,零 Phaser):`clampKnob`(把搖桿旋鈕夾在底座半徑內供演出)、`joystickDirections(dx,dy,radius,deadzone)`(偏移→up/down/left/right;螢幕 Y 向下 → dy<0=上;超過死區的軸才觸發,對角線回報兩軸)。10 條單測。
- `src/game/input.ts`:新增 `mergeSnapshots(kb, touch)` 把觸控 partial snapshot OR 進鍵盤 snapshot——**觸控與鍵盤共用同一條已測 `deriveCommands` 管線**,不重寫指令邏輯。3 條單測。
- `src/game/scenes/ui/MobileControls.ts`(Phaser 演出,thin):左搖桿 + 右側動作鍵(撿/放、建、戳、游),多點觸控(joystick + 按鈕可同時按),`snapshot()` 回傳當前按住的邏輯輸入;`setVisible`/`destroy`(移除 pointer 監聽)。座標用固定 960×540 舞台,經 Scale.FIT 對應觸點。
- **雙鍵詮釋**:任務名「雙鍵」從寬做成 4 顆動作鍵,才能滿足「完整遊玩」(撿放/建/戳/游全可觸控)。
- `main.ts`:`scale: { mode: FIT, autoCenter: CENTER_BOTH }`,960×540 舞台自動縮放置中塞進手機(含直式)。
- 手機顯示條件 `shouldShowMobile()`=觸控裝置或視窗寬<820px,**每幀重算**(轉向/縮放即時切換);結束畫面 overlay 可**點擊重開**(手機無鍵盤 R)。

### 2. 突發事件演出(P2-04 老鷹/熊接進 GameScene)
- GameScene 的 LocalAdapter 預設帶 `hazards:{enabled:true}`,以 `?hazards=0` 關閉(E2E 決定性)。
- `renderHazards(state)`:讀 `state.hazards`,畫 placeholder——老鷹「影子橢圓 + 高處盤旋的鳥,俯衝時降下」、熊「棕圓 + 熊字」。物件懶建+重用,離場時隱藏(非銷毀),restart 時 null、shutdown 時隨場景銷毀。真美術 P2-08/09。
- `window.__otty` snapshot 增列 `hazards`(eagle/bear 的 phase+座標,或 null),供 E2E 斷言。

### 3. D/E/F 動畫
- poke/eat/float 動畫早已在 atlas+registry,GameScene 透過 `animationKeyForAction(o.action)` 自動播放——核心設 action 即演出,無需額外接線(本任務確認並以事件/狀態驅動)。

## 關鍵決策
- 觸控走「產生 InputSnapshot → mergeSnapshots → deriveCommands」路線,零重複邏輯、純模組可測(守 CLAUDE.md 規則 2)。
- hazards 預設開(玩起來有事件),但所有**非 freeze 的 E2E 一律 `?hazards=0`**,保基準穩定。
- 手機可見度每幀重算(採納 review 建議,修好只在 create 算一次的漏洞)。

## 測試結果
- 新增單測:touch 10、mergeSnapshots 3、snapshot hazards 1、params hazards 1(共 15,`npm run check` **201 綠**);`vite build --base=/Otty-DAM-IT-/` 綠。
- E2E:新增 `tests/e2e/mobile.spec.ts`(手機 viewport 開機+畫面基準+hazards=0 斷言);既有 live specs 全補 `?hazards=0`。**E2E 於本 sandbox 仍不可跑**(Chromium CDN 擋/無連線 Chrome),待 CI 或本機首跑 + linux 基準截圖。
- Review:一支 general-purpose subagent 審 diff,結論 ship、無 blocker;已修其點名的 3 個 minor(手機可見度重算、snapshot phase 型別收緊、JSDoc 縮排)。

## 後續 / 交棒
- **首跑 E2E + 補 linux 基準截圖**(smoke/hud/full-round/mobile)——P2-07(全機制 E2E 回歸 + 60fps)可接手。
- 觸控「完整打完一局」的 E2E 驅動(page.touchscreen 拖搖桿)留作後續。
- 美術到位後(P2-08/09)換掉老鷹/熊/道具 placeholder。
