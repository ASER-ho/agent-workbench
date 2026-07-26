import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for Agent Workbench UI smoke.
 *
 * Scope: Browser-only Vite renderer smoke.
 * Does NOT validate: Electron IPC, preload API, main process,
 * terminal:start, SecretStore, pack, dist, or release.
 * Does NOT launch a real Agent.
 * Browser renderer smoke is configured here; Electron E2E uses playwright.electron.config.ts.
 * @playwright/test is installed and both suites are part of the current verification chain.
 */
export default defineConfig({
  testDir: './tests',

  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: 'list',

  // Retry once on CI, zero in local dev
  retries: process.env.CI ? 1 : 0,

  use: {
    // Vite dev server default — override with PLAYWRIGHT_BASE_URL if needed
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',

    // Collect trace on first retry (not on first failure in local)
    trace: 'on-first-retry',

    // Do NOT launch a real Agent; do NOT read SecretStore
  },

  webServer: {
    command: 'npm run dev:renderer',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 30_000
  }
})
