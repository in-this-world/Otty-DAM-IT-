# P1-03 — 水壩進度(core)

需求曲線:`required = round(base × n^0.85)`(base=20):1P 20、2P 36、5P 79、10P 142 —— 次線性,人多總量增但人均降。
建造:build 指令驗證(持樹枝、距 dam.site ≤ BUILD_RADIUS 120)→ 標記 wantsBuild;`damSystem` 同 tick 結算全部建造者,合作加成 `1 + 0.25×(k-1)`,消耗樹枝、累計個人 score、上限 required,達標即刻 phase='won' + gameWon(一次)。
新增(additive):`DamState.site`、`OtterState.wantsBuild`。預設開局撒 2×required 樹枝(seed 決定,測試可用 config.items 覆寫)。
測試 7 條(1–10 人窮舉曲線、加成疊加、拒絕原因、封頂+單次勝利、identity)。
