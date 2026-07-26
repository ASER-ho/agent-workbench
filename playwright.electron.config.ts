import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/electron',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    trace: 'off',
    screenshot: 'only-on-failure'
  }
})
