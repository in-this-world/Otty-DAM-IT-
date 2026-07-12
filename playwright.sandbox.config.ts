/**
 * Sandbox-only Playwright config: the Playwright CDN is blocked here, so the
 * browser comes from the npm-packaged @sparticuz/chromium binary instead.
 * Usage: npx playwright test -c playwright.sandbox.config.ts <spec>
 */
import chromium from '@sparticuz/chromium';
import baseConfig from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...baseConfig,
  retries: 0,
  use: {
    ...baseConfig.use,
    launchOptions: {
      executablePath: await chromium.executablePath(),
      args: chromium.args,
    },
  },
});
