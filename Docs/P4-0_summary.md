# P4-0 — i18n foundation (feat/P4-i18n)

## What was done
- **`src/i18n.ts`** — small, stable runtime other P4 slices build on:
  `t(key, vars?)`, `getLang()`, `setLang(l)`, `toggleLang()`, `onLangChange(cb)`,
  `type Lang = 'zh-TW' | 'en'`, `LANGS`. Missing key → returns the key; `{var}`
  placeholders interpolate, and an **absent** var is left in place (`{name}`)
  rather than blanked. Every browser-global read (`localStorage`, `navigator`)
  is guarded with `typeof` + try/catch so the module never throws under Vitest's
  `node` env; initial language = saved `localStorage['otty.lang']` → else
  `navigator.language` starting `zh` → else `zh-TW` (source-of-truth language).
- **`src/locale/zh-TW.ts` / `src/locale/en.ts`** — flat `Record<string,string>`
  default exports, one key per line, grouped by prefix (`ui. hint. game. hud.
  lobby. controls. title.`). zh-TW holds the strings that used to be hardcoded;
  en mirrors them exactly. `title.*` awards (for P4-8) are seeded now so later
  slices inherit polished translations.
- **Call sites routed through `t()`**: `GameScene` (HUD control legend, win/lose
  overlay title, restart hint), `MobileControls` (7 action-button labels →
  `controls.*` keys), `LobbyOverlay` (every card title, field label,
  placeholder, button, banner, roster badge).
- **Lobby EN/中 language toggle** — a compact button in every card header
  (`langToggle()`), flips language via `toggleLang()` then calls a
  `this.rerender` closure that each screen (`renderSetup` / `renderReadyRoom`)
  sets to itself, so the lobby re-renders live in the new language and the
  choice persists to `localStorage`.

## Key decisions
- **`onLangChange` subscription API** added beyond the plan's snippet: lets live
  UI react to a language flip without each call site re-reading storage. Used by
  the lobby indirectly (toggle → rerender); available to HUD later if needed.
- **Absent-var placeholders are preserved**, not dropped — makes a missing
  interpolation obvious in-game instead of rendering a half-sentence.
- **`protocol.ts` NOT routed through `t()`** — it is imported by the Colyseus
  server too and must stay free of client-only globals. If server copy ever
  needs localizing, send a code across the wire and let the client call `t()`.
- **Language toggle label computed in code** (`getLang()==='zh-TW' ? 'EN' : '中'`)
  rather than a dict key — it names the *target* language, which shouldn't be
  translated.

## Tests (TDD: red → green)
- `tests/unit/i18n.test.ts` (11 tests) written first (red — modules missing),
  then implemented to green. Covers: missing-key fallback, `{var}` interpolation,
  absent-var preservation, language switch, `getLang`, `toggleLang`, subscribe +
  unsubscribe, no-notify-when-unchanged, and a **translation-completeness** block
  that fails if en/zh-TW key sets differ, if any value is blank, or if a key's
  `{placeholders}` differ between languages — a guard the first build lacked.
- `npm run check` (tsc --noEmit && eslint . && vitest run): **317 passed** (was
  306; +11). Also fixed a pre-existing red baseline: `arena.test.ts` missing
  `s.water!` null-guard (tsc TS18048) that had been failing `check` on `main`.

## Follow-ups for later P4 slices
- Import `t/setLang/getLang/toggleLang/type Lang` from `src/i18n.ts`; don't change
  its exported shape.
- New UI string → add one key to **both** locale files (zh-TW = the string you'd
  hardcode, en = its translation) under the right prefix, then call `t()`.
- `hint.needStick`, `ui.restart`, and `title.*` already exist — wire them up in
  P4-core / P4-8 instead of re-adding.
