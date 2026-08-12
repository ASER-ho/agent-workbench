import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/electron',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  workers: 1,
  fullyParallel: false,
  // First Electron cold start on a shared CI runner can exceed even 60s; the
  // retry re-launches the app on a warm cache (subsequent launches are fast).
  retries: process.env.CI ? 1 : 0,
  use: {
    trace: 'off',
    screenshot: 'only-on-failure'
  }
})
