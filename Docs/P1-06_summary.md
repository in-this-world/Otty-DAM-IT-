# P1-06 — 動畫接入

BootScene preload atlas(otter.png/json)+ animations.json,`registerAnimations` 註冊 7 動作(otter- 前綴、冪等)。
`Record<OtterAction, true>` 讓 core 動作聯集與註冊表在編譯期強制同步。
GameScene 依 `state.action` 切換動畫、facing==='left' 翻面。
測試 5 條:鍵位映射、manifest 驗證(含破損案例)、缺動作偵測、冪等註冊、以及「真實管線輸出 animations.json 覆蓋所有 7 動作」契約測試。
