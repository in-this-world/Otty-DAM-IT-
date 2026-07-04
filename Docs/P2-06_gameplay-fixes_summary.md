# Gameplay fixes (live-play feedback): swim button, poke reach, stuck build pose

來源:boss 實機試玩回報三點。以連線的 Chrome 逐一診斷/修正。

## 1. 「B 建造卡住,要移動才會恢復」— 修正
- **根因**:`damSystem`(及 `poke`/`eat`)把 `action` 設成暫態姿勢後就**永久停在該姿勢**,直到有移動指令才改變 → 水獺看起來卡死。
- **修正**:新增 `src/core/action.ts` `transientActionSystem` + `OtterState.actionMs`。暫態姿勢(build/poke/eat)設定時蓋上 `actionMs=TRANSIENT_ACTION_HOLD_MS`(350ms);系統每 tick 遞減,到期後自動回 `carry`(手上有物)或 `idle`/`walk`。排在 `damSystem` 之後、`timerSystem` 之前。
- 驗證:建造後姿勢序列 `build×~7 → idle`(不再卡住)。

## 2. 「F 戳不到隊友」— 修正
- **根因**:`POKE_RADIUS=56`,但水獺立繪約 96px 寬;兩隻看似貼著時中心距常 >56 → 戳空。
- **修正**:`POKE_RADIUS` 56 → **90**(約一個身位),看得到貼近就戳得到。掉物/2s 無敵幀邏輯不變。

## 3. 「游泳應該是按鍵」— 依 boss 選擇實作(hold-to-swim,鍵 = C)
- 之前:踏進水域就自動漂浮。現在:**在水中且按住 C** 才漂浮/組筏/洗澡去 debuff;沒按 C 就正常走過水面。
- 型別:`OtterState.wantsSwim?`;指令 `swim`/`stopSwim`(input 邊緣觸發:按下送 swim、放開送 stopSwim,`KeyC`)。
- `floatSystem`:入水條件改為 `isInWater(pos) && wantsSwim`。`applySwim`/`applyStopSwim` 於 float.ts。
- 註:AI 不會按 C,故 AI 不漂浮(單機下水獺筏僅人類;多人 P3 再現)。GameScene 提示列加「C游泳」。

## 測試
- `npm run check` 全綠:**166 測試**(159 + 7:float swim-gate/commands 3、action 3、input swim 1;float 既有測試改為預設 `wantsSwim:true`)。
- headless 驗證:build 不再卡、AI(含水域+慢速)仍於 80s 完壩、POKE_RADIUS=90。

## 後續注意
- 暫態姿勢改為 350ms 後自動回復;若要更長的建造/吃魚演出可調 `TRANSIENT_ACTION_HOLD_MS`。
- hold-to-swim 讓 AI 不再漂浮;若要 AI 也會游可讓 planner 在需要時送 swim。
- 實機 keyboard 測試需在**前景可見**的分頁(Phaser 於隱藏分頁會暫停整個迴圈)。
