# P1-05 — GameScene(渲染層)

`GameScene` 建 LocalAdapter(1P、180s、seed 隨機)訂閱 core 狀態演出;規則零實作(鐵則 2)。
鍵位:方向鍵/WASD 移動、E/空白鍵情境撿放、B 建造、R(結算後)重開。
輸入映射為純模組 `src/game/input.ts`(邊緣觸發、方向優先序、持向鎖定),單元測試 5 條,不需 Phaser。
物品/水壩用幾何色塊 placeholder(P2-08 到貨即換)。場景 shutdown 正確停 adapter/退訂。
**尚待真瀏覽器驗證**(sandbox 無 Playwright browser):首次 `npm run e2e` 於 CI 或本機。
