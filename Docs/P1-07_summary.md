# P1-07 — HUD + window.__otty

HUD:進度條(左上)、倒數 mm:ss(右上、無條件進位)、勝負 overlay(R 重開)、操作提示。
純函式 `formatTime` / `progressRatio`(測試 3 條)同時餵 HUD 與 `window.__otty`,保證「HUD 顯示 = 模擬狀態」。
`__otty` 契約(src/game/snapshot.ts,測試 1 條):`{ ready, tick, phase, timerMs, dam{progress,required}, otters{id:{x,y,action,carrying}}, itemsOnGround }`。
E2E `tests/e2e/hud.spec.ts` 2 條(狀態一致性、鍵盤→移動)已寫好,**待瀏覽器環境首跑**。
