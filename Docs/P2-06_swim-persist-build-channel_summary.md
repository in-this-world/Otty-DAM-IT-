# Swim persistence + channeled build (play feedback)

## 1. 游泳(C 切換)在水中移動不再取消
- 之前:`floatSystem` 只在「入水那一刻」把 idle/walk 設成 float,之後移動會被 movement 覆寫成 walk → 看起來取消漂浮。
- 現在:只要 `wantsSwim` 為真且在水域,**每 tick 強制 `action='float'`**——在水裡走動也保持漂浮姿勢/狀態;只有離開水域或再按 C 關閉才結束(「以水域為界」)。水中同時是安全區(清 stun)。

## 2. 建造改為「蓄力」通道:建造動畫播 3 次才生效
- build 動畫 = 3 幀 @8fps = 375ms/次;`BUILD_CHANNEL_MS = 1125`(3 次)。
- `applyBuild` 不再即時加分,而是**開始通道**(`OtterState.buildingMs=1125`,`action='build'`);重複按 B / AI 連送 build 於通道中會被忽略。
- `damSystem` 每 tick 遞減通道;**移動、被戳/暈、丟掉建材、離開範圍都會取消**(保留建材)。通道歸零才結算:消耗建材、加進度、`damProgressed`、動畫回 idle。合作加成改為「同 tick 一起完成通道」的人數。
- 因此舊「B 建造卡住」不復存在(通道自管姿勢),`build` 從暫態姿勢集移除(transient 只剩 poke/eat)。

## 型別/檔案
- `OtterState.buildingMs?`(additive)。`dam.ts`(applyBuild/damSystem 重寫 + `BUILD_CHANNEL_MS`)、`float.ts`(swim 常駐)、`action.ts`(transient 去掉 build)、`state.ts`(factory)。

## 測試/驗證
- `npm run check` 全綠:**168 測試**;`vite build` 綠。
- 更新:dam.test(通道+移動取消+合作同時完成)、items.test(石/土建造走通道)、action.test(poke 暫態、build 通道後 idle)、simulation.test(guard 200→800,通道較慢)、float.test(水中移動保持漂浮)。
- headless playtest:AI(慢速+水域+通道)seed 7/42/99 於 83–102s 完壩(< 180s)。

## 後續注意
- 建造變慢(每次 +~1.1s):AI 仍穩贏;若要更快可調 `BUILD_CHANNEL_MS`。
- 人類建造需站定 ~1.1s(移動即取消)。
- AI 不游泳(不送 C);hold-in-water 筏加成僅多人時出現。
