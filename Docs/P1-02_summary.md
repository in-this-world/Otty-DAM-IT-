# P1-02 — 撿取/放下(core)

`PICKUP_RADIUS = 48`。pickUp:手滿 → handsFull;指定 id → noSuchItem / itemUnavailable(他人持有)/ noItemInRange;未指定 → 範圍內最近的自由物品。撿起:carrying + action='carry'、item.heldBy。
drop:物品落在腳邊並停下水獺(movement 在指令後執行,停下確保物品與水獺同格);空手 → notCarrying。
測試 11 條(含最近物優先、持有物跳過、carry 動作維持)。
