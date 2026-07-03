# P2-02 — 戳人 (poke): hit detection + drop items + i-frames

## 做了什麼
- 新增 `src/core/poke.ts`(純邏輯):`applyPoke(state, otter, events)`。
  - 找攻擊者 `POKE_RADIUS`(56)內最近的**其他**水獺為目標。
  - 命中且目標非無敵:目標手上物品掉到腳邊(`itemDropped`)、清 `carrying/wantsBuild`、獲得 `POKE_INVULN_MS`(2000ms)無敵、停下轉 idle。
  - 目標已無敵(`invulnMs>0`):彈開,不掉物、不刷新無敵。
  - 揮空(範圍內無人):攻擊者仍播 poke 動畫,`otterPoked` 帶 `targetId:null`。
  - 攻擊者一律 `action:'poke'`。
- `types.ts`:`OtterState.invulnMs?: number`(additive/optional,不破舊測)。
- `effects.ts`:idle 判斷與逐 tick 衰減都納入 `invulnMs`(`Math.max(0, invulnMs - dt)`)。
- `tick.ts`:`poke` case 由 stub 改接 `applyPoke`(移除舊 TODO)。
- `state.ts`:otter factory 補 `invulnMs: 0`。
- 遊戲層輸入:`input.ts` 加 `KeyF → poke`(edge-triggered,`InputSnapshot.poke`/`pokeWasDown`);`GameScene` 控制提示補「F戳人」。

## 關鍵決策
- 無敵幀掛在**受害者**身上(防連續騷擾farming),非攻擊者。
- Poke key 用 **F**(WASD 的 D 已是右移,避免衝突;v0.1 的「D」是動畫代號非按鍵)。
- Poke 對空手目標也給無敵(僅不掉物),簡化且防騷擾一致。
- Poke 不造成暈眩(僅掉物+無敵),符合 v0.1「掉物資 + 2s 無敵幀」。

## 測試結果
- `tests/unit/core/poke.test.ts` 7 條 + `input.test.ts` 新增 1 條。
- `npm run check` 全綠:**153 測試**(145 + 8)。tsc + eslint 乾淨。

## 後續注意
- 尚無「戳人」專屬動畫/音效演出(game-layer,P2-06);目前借用既有 poke 動畫。
- 未做方向性判定(以最近距離為準,不限正面);若要「只戳面前」可加 facing 過濾。
- P2-04 老鷹免疫等仍讀 `hat`,與 poke 無耦合。
