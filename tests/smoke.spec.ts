/**
 * Browser-only Vite renderer smoke tests — Phase P1.
 *
 * IMPORTANT:
 * - These tests use the Playwright-managed renderer Vite server (default http://localhost:5173).
 * - They do NOT launch Electron, call terminal:start, or invoke real Agents.
 * - They do NOT read SecretStore, preload API data, or filesystem paths.
 *
 * Known limitation:
 * - Browser-only smoke connects to the Vite dev server renderer page.
 * - Without the Electron preload bridge (`window.api`), React components
 *   that depend on IPC data may not render fully (loading/fallback states).
 * - UI structure tests (02-04, 06) are skipped for browser renderer mode and
 *   covered by the separate Electron E2E suite.
 * - Security scans (05, 07) work universally because they scan page content
 *   regardless of whether React components are fully hydrated.
 *
 * Run: `npm run smoke`.
 */

import { test, expect } from '@playwright/test'

// ── helpers ──

/** Scan full page text for raw-secret-like patterns. */
async function assertNoRawSecrets(page: import('@playwright/test').Page) {
  const content = await page.content()
  // sk- followed by a long token (20+ chars of hex/base64)
  expect(content).not.toMatch(/sk-[a-zA-Z0-9+/=]{20,}/)
  // bare key/token/secret assignments with plausible values
  expect(content).not.toMatch(/\bapi_key\s*[=:]\s*['"]?[a-zA-Z0-9+/=]{16,}/i)
  expect(content).not.toMatch(/\bAPI_KEY\s*[=:]\s*['"]?[a-zA-Z0-9+/=]{16,}/)
  expect(content).not.toMatch(/\btoken\s*[=:]\s*['"]?[a-zA-Z0-9+/=]{16,}/i)
  expect(content).not.toMatch(/\bsecret\s*[=:]\s*['"]?[a-zA-Z0-9+/=]{16,}/i)
}

/** Scan page text for Windows absolute path patterns. */
async function assertNoFullLocalPaths(page: import('@playwright/test').Page) {
  const content = await page.content()
  // Drive-letter paths: C:\... D:\... etc.
  expect(content).not.toMatch(/[A-Za-z]:\\[^\s]{2,}/)
  // UNC paths
  expect(content).not.toMatch(/\\\\[^\\]+\\[^\s]{2,}/)
}

// ── tests ──

test.describe('P1 Basic UI Smoke (browser-only)', () => {
  test('01 — app body renders (Vite dev server reachable)', async ({ page }) => {
    await page.goto('/')
    // Body must be visible — confirms Vite dev server is serving the renderer
    await expect(page.locator('body')).toBeVisible()
    // NOTE: React components may not fully render without Electron preload
    // bridge (window.api). Structural UI assertions are covered by the separate Electron E2E suite.
  })

  test.skip('02 — Environment Readiness Panel renders', async ({ page }) => {
    // SKIPPED — requires Electron preload bridge for React data hydration.
    // Deferred to full Electron Playwright smoke.
    await page.goto('/')
    const readiness = page.locator('text=Environment Readiness')
    await expect(readiness.first()).toBeVisible({ timeout: 10_000 })
  })

  test.skip('03 — Agent Launch button is disabled / not available', async ({ page }) => {
    // SKIPPED — requires Electron preload bridge for React data hydration.
    await page.goto('/')
    const disabledBtn = page.locator('button[disabled], [aria-disabled="true"]').filter({ hasText: /Launch|Start|Agent/i })
    const notAvailable = page.locator('text=(not available)')
    const exists = (await disabledBtn.count()) > 0 || (await notAvailable.count()) > 0
    expect(exists).toBe(true)
  })

  test.skip('04 — Launch panel shows Planned / not available', async ({ page }) => {
    // SKIPPED — requires Electron preload bridge for React data hydration.
    await page.goto('/')
    const planned = page.locator('text=Planned')
    const notYet = page.locator('text=not yet available')
    const exists = (await planned.count()) > 0 || (await notYet.count()) > 0
    expect(exists).toBe(true)
  })

  test('05 — StatusBar does not display full local paths', async ({ page }) => {
    await page.goto('/')
    await assertNoFullLocalPaths(page)
  })

  test.skip('06 — Smoke Checklist panel visible', async ({ page }) => {
    // SKIPPED — requires Electron preload bridge for React data hydration.
    await page.goto('/')
    const checklist = page.locator('text=Smoke Checklist')
    const manualBadge = page.locator('text=Manual')
    const exists = (await checklist.count()) > 0 || (await manualBadge.count()) > 0
    expect(exists).toBe(true)
  })

  test('07 — no raw API key / secret visible in page content', async ({ page }) => {
    await page.goto('/')
    await assertNoRawSecrets(page)
  })
})
