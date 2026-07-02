# P0-02 (Playwright smoke) + P0-05 (CI workflow) — Summary

Date: 2026-07-02 · Agent: Tester/Maintainer

## What was written

### `tests/e2e/smoke.spec.ts` (P0-02, upgraded from scaffold)
Single spec, `chromium` project:
1. `page.goto('/')` (dev server started by Playwright `webServer`).
2. `page.waitForFunction` polls `window.__otty?.ready === true` (15 s timeout) — the
   boot contract set by `src/game/scenes/BootScene.ts`.
3. Asserts the flag via `page.evaluate`.
4. Asserts the Phaser `<canvas>` is visible.
5. Collects `pageerror` events during boot and asserts none occurred.
6. Waits 500 ms for the first frame to settle, then
   `expect(page).toHaveScreenshot('boot-screen.png')`.

### `playwright.config.ts` (upgraded)
- `snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}-{platform}{ext}'`
  → baselines land in `tests/e2e/__screenshots__/smoke.spec.ts/boot-screen-<platform>.png`.
  Platform suffix keeps Windows-local and Linux-CI baselines separate.
- `expect.toHaveScreenshot`: `maxDiffPixelRatio: 0.02`, `animations: 'disabled'` —
  small diff budget because the game renders to a live canvas (AA/driver variance).
- Fixed `viewport: 1280x720`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`.
- `reporter: [list, html(open:never)]` so `playwright-report/` exists for CI artifacts.
- CI-aware: `forbidOnly`, `retries: 1`, `reuseExistingServer: !CI`. The CI flag is read
  via a `globalThis` cast because tsconfig pins `types: ["vitest/globals"]` (no
  `@types/node` globals available in this file).
- `webServer` unchanged in spirit (`npm run dev` on :5173) with a 60 s startup timeout.

### `.github/workflows/ci.yml` (P0-05)
Triggers: `push` + `pull_request` on `main`. Two parallel jobs (justification:
lint/type/unit failures surface in ~1 min without paying the ~2 min Playwright
browser install; neither gates the other):
- **check**: checkout → setup-node 22 (npm cache) → `npm ci` → `npm run check`.
- **e2e**: checkout → setup-node 22 (npm cache) → `npm ci` →
  `npx playwright install --with-deps chromium` → `npm run e2e` (with `CI=true`) →
  on failure, upload `playwright-report/` + `test-results/` as artifact
  (`playwright-artifacts-<attempt>`, 14-day retention).
- `concurrency` group cancels superseded runs on the same ref.

### Housekeeping
- `tests/e2e/__screenshots__/.gitkeep` so the baseline directory exists in git.
- `.gitignore` already covers `test-results/` and `playwright-report/`; baselines in
  `tests/e2e/__screenshots__/` are NOT ignored and should be committed.

## Baseline screenshot semantics (first run)

No baseline image exists yet (browsers cannot run in the authoring sandbox).

- **Local (recommended first step)**: run `npx playwright test --update-snapshots`
  once, review `tests/e2e/__screenshots__/smoke.spec.ts/boot-screen-win32.png`
  (platform suffix matches your OS), commit it. Subsequent local runs compare
  against it.
- **CI (linux baseline)**: the first CI e2e run will FAIL with
  "A snapshot doesn't exist … writing actual" — this is expected. Download the
  `playwright-artifacts-*` artifact, review the candidate image in
  `test-results/`, commit it to
  `tests/e2e/__screenshots__/smoke.spec.ts/boot-screen-linux.png`, re-run CI.
  (Alternative: generate the linux baseline locally via the Playwright Docker
  image and commit it before pushing.)

## Verified in sandbox (static only — no browsers installable here)

| Check | Result |
| --- | --- |
| `npx playwright test --list` | PASS — 1 test in 1 file discovered, config parses |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx eslint playwright.config.ts tests/e2e/smoke.spec.ts` | PASS |
| `python3 yaml.safe_load(.github/workflows/ci.yml)` | PASS (valid YAML) |
| `npm run check` (repo-wide, incl. concurrent agents' work) | PASS |

## NOT verified — must be done later

1. **Actual E2E execution**: sandbox cannot install Playwright browsers (CDN
   blocked, no sudo). On the user machine: `npx playwright install chromium`
   once, then `npm run e2e`. Expect the very first run to fail on the missing
   baseline — see semantics above.
2. **First CI run**: confirm both jobs go green after the linux baseline is
   committed; confirm artifact upload works on a forced failure if desired.
3. **Screenshot stability**: if the boot screen animates, the 2% diff budget may
   need tuning, or the shot may need to target a settled UI element instead of
   the full page. Revisit after the first few real runs.
