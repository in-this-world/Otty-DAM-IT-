# P1-01 — 移動 + 邊界(core)

move 指令設定 facing/vel/action(空手 walk、持物 carry);stop 歸零速度。
`movementSystem` 每 tick 以 `pos += vel * dt` 積分,夾在 world 邊界內;無人移動時回傳同一參考(零配置成本)。未知方向 → `commandRejected(unknownDirection)`。
新增型別(additive):`OtterState.vel: Vec2`、`GameState.world`。
測試 8 條:四方向速度/朝向、積分、stop、四邊界夾住、非 playing 不移動、identity。
