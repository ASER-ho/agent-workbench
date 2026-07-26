import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('browser smoke starts an isolated renderer server automatically', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const config = readFileSync('playwright.config.ts', 'utf8')

  assert.equal(pkg.scripts['dev:renderer'], 'electron-vite dev --rendererOnly')
  assert.match(config, /webServer:\s*\{/)
  assert.match(config, /command:\s*'npm run dev:renderer'/)
  assert.match(config, /url:\s*process\.env\.PLAYWRIGHT_BASE_URL/)
  assert.match(config, /reuseExistingServer:\s*false/)
})
