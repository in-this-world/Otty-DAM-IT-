# P0-01 Summary — Project Scaffold

Date: 2026-07-02 · Owner: Maintainer agent

## What was built
Vite + TypeScript + Phaser 3 scaffold at repo root, per MASTER_PLAN §2/§2.1.

- **Scripts**: `dev` (vite), `build` (tsc + vite build), `test` (vitest run), `e2e` (playwright test), `check` (tsc --noEmit && eslint . && vitest run), `assets` (tsx scripts/prepare-assets.ts — stub, logs "not implemented"; real pipeline is P0-03).
- **Structure**: `src/core/` (pure TS — ESLint `no-restricted-imports` rule blocks `phaser` imports there), `src/game/scenes/`, `src/game/anim/`, `tests/unit/`, `tests/e2e/`, `scripts/`, `public/assets/`.
- **BootScene** (`src/game/scenes/BootScene.ts`): title text + sets `window.__otty = { ready: true }` on create. `src/main.ts` creates the Phaser.Game (960x540, Arcade physics, parent `#game`).
- **Tests**: `tests/unit/smoke.test.ts` (green), `tests/e2e/smoke.spec.ts` (asserts `__otty.ready` via Playwright; config auto-starts dev server).
- ESLint flat config (typescript-eslint recommended), strict tsconfig, `.gitignore`.

## Versions
phaser 3.90.0 (pinned `~3.90.0` — npm's default resolved to Phaser 4, corrected to Phaser 3 per plan) · vite ^8.1.3 · typescript ^6.0.3 · vitest ^4.1.9 · @vitest/coverage-v8 ^4.1.9 · eslint ^10.6.0 · typescript-eslint ^8.62.1 · playwright / @playwright/test ^1.61.1 · tsx ^4.22.5 · node v22.22.3.

## Verification
- `npm run check` — **green** (typecheck + lint + 1/1 unit test).
- Dev server: `npm run dev` on :5173, `curl` returns index.html, HTTP 200. ✅

## Issues / notes
- **Playwright browsers NOT installed** in this sandbox: `npx playwright install chromium --with-deps` fails (sudo blocked), plain `install chromium` fails (CDN download blocked by network allowlist). No system chromium/chrome binary found. → `npm run e2e` cannot run in the sandbox; run E2E via Playwright MCP (per plan §2.1) or on a machine/CI with browsers (P0-05 CI should `playwright install chromium --with-deps`).
- typescript 6.x is newer than typescript-eslint's officially tested range; no warnings or errors surfaced in `check`. Pin to typescript@5 if it ever misbehaves.
