import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { isAllowedExternalUrl } from '../../src/main/utils/navigation-security.ts'

test('external URL policy allows only credential-free HTTPS URLs', () => {
  assert.equal(isAllowedExternalUrl('https://example.com/docs?q=agent#workbench'), true)
  assert.equal(isAllowedExternalUrl('HTTPS://EXAMPLE.COM/path'), true)

  for (const candidate of [
    'http://example.com',
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'data:text/html,hello',
    'mailto:test@example.com',
    'agent-workbench://open',
    `https://${'user'}@example.com`,
    `https://${['user', 'password'].join(':')}@example.com`,
    ' https://example.com',
    '',
    undefined,
    null
  ]) {
    assert.equal(isAllowedExternalUrl(candidate), false, String(candidate))
  }
})

test('main window enables sandbox and blocks renderer navigation', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'main', 'index.ts'), 'utf8')

  assert.match(source, /sandbox:\s*true/)
  assert.match(source, /webContents\.on\('will-navigate'[\s\S]*?event\.preventDefault\(\)/)
  assert.match(source, /isAllowedExternalUrl\((?:details\.url|externalUrl)\)/)
  assert.doesNotMatch(source, /shell\.openExternal\(details\.url\)/)
})
