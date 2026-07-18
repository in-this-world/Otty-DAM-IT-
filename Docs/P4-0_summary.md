# P4-0 — i18n foundation (基礎)

**What was done**
- `src/i18n.ts` — small, stable API: `t(key, vars?)`, `setLang(l)`, `getLang()`, `type Lang = 'zh-TW' | 'en'`. Initial language: `localStorage['otty.lang']` if valid, else `navigator.language` starting with `zh` → `zh-TW`, else `en`; under Vitest (node, no `window`/`localStorage`/`navigator`) it falls back to `zh-TW` without throwing (all browser-global access guarded with try/catch + `typeof` checks). Missing keys fall back to returning the key itself. `{var}` templates interpolate via `vars`.
- `src/locale/zh-TW.ts` / `src/locale/en.ts` — flat `Record<string, string>` default-export dictionaries, one key per line, grouped by feature prefix (`ui.*`, `hint.*`, `game.*`, `hud.*`, `lobby.*`, `controls.*`) to keep future appends low-conflict.
- `src/game/scenes/GameScene.ts` — win/lose overlay title (`game.win`/`game.lose`), restart hint (`game.restartHint`), HUD controls legend (`hud.controls`) now go through `t()`. Left the `"DAM"` signpost label as a literal — it reads as a wordmark/icon rather than a sentence, same call as leaving brand-ish short marks untranslated.
- `src/game/lobby/LobbyOverlay.ts` — every user-facing string (card titles, field labels, placeholders, buttons, banners/errors, roster badges) now routed through `t()`. Added an **EN/中** language toggle button rendered in every `card()` header (top-right); clicking it calls `setLang()` (which persists to `localStorage['otty.lang']`) then re-renders whichever screen is currently showing via a `rerenderCurrent` closure that both `renderSetup()` and `renderReadyRoom()` refresh on every call.
- `src/game/scenes/ui/MobileControls.ts` — the 7 on-screen action button labels (撿/放, 建, 戳, 游, 丟, 挖, 吃) now come from `t('controls.*')` instead of literal strings in the `BUTTONS` table.
- `src/net/protocol.ts` — `NET_ERROR_MESSAGES` **left as-is**, with a comment explaining why (see Key decisions).
- `tests/unit/net/arena.test.ts` — unrelated pre-existing bug fixed in passing: `s.water.length` → `s.water!.length` (tsc `TS18048`, `water` is optional on `GameState`). This was failing `npm run check` on `main` *before* any i18n work started (confirmed by checking out `main` clean and running `npm run check`); fixed because it blocked the "must be green to merge" gate and is a one-line null-guard, not a scope change.

**Key decisions**
- `NET_ERROR_MESSAGES` in `protocol.ts` was **not** routed through `t()`. That file is imported by both the client and the Colyseus server and must stay pure/Vitest-safe with zero client-only globals. `i18n.ts` guards its browser-global reads, but it's still conceptually a client-side module (localStorage/navigator, `setLang` persistence). Importing it into a shared client+server protocol file would blur that boundary for no benefit yet. Left a code comment recommending that if server error copy needs localization later, the client should map `NetErrorCode` → `t()` string itself rather than pulling `i18n.ts` into `protocol.ts`.
- `"DAM"` text label above the build site (`GameScene.ts`) left untranslated — read as a wordmark, not a sentence.
- Language toggle lives in the shared `card()` helper so it appears on both lobby screens automatically instead of being duplicated in `renderSetup()`/`renderReadyRoom()`.

**Tests**
- Before: 306 tests passing (42 files) — but `npm run check` was actually **red** on `main` due to the pre-existing `arena.test.ts` bug (tsc failed, so eslint/vitest never ran under `check`). `vitest run` alone (all 306 non-i18n tests) passed.
- After: 310 tests passing (42 files), `npm run check` (`tsc --noEmit && eslint . && vitest run`) fully green.
- New: `tests/unit/i18n.test.ts` (4 tests) — missing-key fallback, `{var}` interpolation, language switching (`zh-TW` ↔ `en`), and a real-key interpolation case (`lobby.roomTitle` with `{code}`). Written first (red — `Cannot find module '../../src/i18n'`), then implemented to green, per TDD convention.
- Live browser sanity check (`npm run dev` + Claude-in-Chrome) was **skipped**: the dev server runs inside this task's isolated sandbox, which the user's actual Chrome browser (driven by the claude-in-chrome MCP) cannot reach over the network. Relied on `npm run check` instead, per the task's fallback instruction.

**Locale keys introduced** (naming convention: `feature.camelCaseName`, flat, no nesting)
- Shared/cross-cutting (other P4 branches should use these, don't redefine): `ui.restart`, `hint.needStick`
- Game/HUD: `game.win`, `game.lose`, `game.restartHint`, `hud.controls`
- Lobby: `lobby.title`, `lobby.nickname`, `lobby.hatColor`, `lobby.scarfColor`, `lobby.roomCodePlaceholder`, `lobby.joinCodeLabel`, `lobby.invalidCode`, `lobby.create`, `lobby.join`, `lobby.connecting`, `lobby.connectFailed`, `lobby.roomTitle` (`{code}` var), `lobby.ownerBadge`, `lobby.spectatorBadge`, `lobby.shareLink`, `lobby.ready`, `lobby.unready`, `lobby.start`, `lobby.spectatorNotice`, `lobby.langToggle`
- Mobile controls: `controls.interact`, `controls.build`, `controls.poke`, `controls.swim`, `controls.throw`, `controls.dig`, `controls.eat`

**Follow-ups for other P4 branches**
- Import `t`, `setLang`, `getLang`, `type Lang` from `src/i18n.ts`. Don't change that module's exported shape — it's the stable API other slices build on.
- For any new UI string: add one key to **both** `src/locale/zh-TW.ts` and `src/locale/en.ts` (zh-TW value = the string you'd have hardcoded; en = your translation), then call `t('your.new.key')` at the call site. Keep dictionaries flat and grouped by feature prefix to avoid merge conflicts.
- `hint.needStick` and `ui.restart` already exist and are unused by any call site yet — wire them up if/when your slice needs them instead of re-adding.
- If a shared/server-side file needs localized copy, don't import `src/i18n.ts` into it directly (see the `protocol.ts` decision above) — send a code/key across the wire and let the client call `t()`.
