# P1-04 — 倒數 + 洪水判定(core)

`timerSystem`(pipeline 最後):playing 時 timerMs -= dt(下限 0);到 0 → progress ≥ required ? won : lost,事件含各水獺 scores,僅發一次(phase guard)。判定後 timer 凍結、指令全拒。
`defaultSystems = [movement, dam, timer]`,LocalAdapter 直接可玩。
測試 4 條 + 模擬測試 2 條(腳本化撿→建 20 次獲勝;掛機到洪水失敗)。
