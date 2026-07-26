import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildApiEndpoint,
  isStoredApiBindingAllowed,
  normalizeApiBaseUrl
} from '../../src/main/utils/api-url.ts'
import { createArchiveInvocation } from '../../src/main/utils/archive-command.ts'
import { locateExecutable, readExecutableVersion } from '../../src/main/utils/external-command.ts'

test('API base URLs allow HTTPS and loopback HTTP only', () => {
  assert.equal(normalizeApiBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1')
  assert.equal(normalizeApiBaseUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1')
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080')
  assert.equal(normalizeApiBaseUrl('http://[::1]:8080'), 'http://[::1]:8080')
  assert.equal(
    buildApiEndpoint('https://api.example.com', '/v1/models'),
    'https://api.example.com/v1/models'
  )

  for (const candidate of [
    'http://api.example.com',
    'file:///etc/passwd',
    'ftp://api.example.com',
    'https://user@example.com',
    `https://${['user', 'password'].join(':')}@example.com`,
    'https://api.example.com?target=other',
    'https://api.example.com/#fragment',
    '',
    undefined
  ]) {
    assert.throws(() => normalizeApiBaseUrl(candidate), /API base URL/)
  }
})

test('stored secret references remain bound to their saved base URL', () => {
  const stored = { baseUrl: 'https://api.example.com', apiKeyRef: 'api:test:fixture' }
  assert.equal(isStoredApiBindingAllowed({ ...stored }, stored), true)
  assert.equal(
    isStoredApiBindingAllowed(
      { baseUrl: 'https://attacker.invalid', apiKeyRef: stored.apiKeyRef },
      stored
    ),
    false
  )
  assert.equal(
    isStoredApiBindingAllowed({ baseUrl: stored.baseUrl, apiKeyRef: 'api:test:other' }, stored),
    false
  )
})

test('production API handler imports and applies the stored binding policy', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'main', 'ipc', 'api.ts'), 'utf8')
  assert.match(source, /from '..\/utils\/api-url'/)
  assert.match(source, /isStoredApiBindingAllowed\(/)
  assert.match(source, /buildApiEndpoint\(/)
})

test('archive compression passes paths out-of-band instead of interpolating PowerShell', () => {
  const sourceDir = ['C:', 'Users', "O'Brien", 'source'].join('\\')
  const zipPath = ['C:', 'Users', "O'Brien", 'output.zip'].join('\\')
  const invocation = createArchiveInvocation(sourceDir, zipPath, { SystemRoot: 'C:\\Windows' })
  const command = invocation.args.join(' ')
  assert.equal(command.includes(sourceDir), false)
  assert.equal(command.includes(zipPath), false)
  assert.equal(invocation.env.AGENT_WORKBENCH_ARCHIVE_SOURCE, sourceDir)
  assert.equal(invocation.env.AGENT_WORKBENCH_ARCHIVE_DESTINATION, zipPath)
  assert.throws(() => createArchiveInvocation('relative', zipPath), /absolute/)

  const source = readFileSync(join(process.cwd(), 'src', 'main', 'ipc', 'package.ts'), 'utf8')
  assert.match(source, /createArchiveInvocation\(sourceDir, zipPath\)/)
  assert.match(source, /spawn\('powershell\.exe', invocation\.args/)
  assert.match(source, /env: invocation\.env/)
  assert.doesNotMatch(source, /Compress-Archive[^`]*\$\{sourceDir\}/)
  assert.doesNotMatch(source, /Compress-Archive[^`]*\$\{zipPath\}/)
})


test('external command discovery never interpolates discovered paths into a shell', () => {
  assert.equal(locateExecutable('bad&command').ok, false)
  assert.equal(readExecutableVersion('relative-tool.exe').ok, false)

  for (const relativePath of [
    ['src', 'main', 'ipc', 'maintenance.ts'],
    ['src', 'main', 'services', 'diagnostics.ts']
  ]) {
    const source = readFileSync(join(process.cwd(), ...relativePath), 'utf8')
    assert.doesNotMatch(source, /execSync/)
    assert.doesNotMatch(source, /cmd\s+\/c/i)
    assert.match(source, /locateExecutable\(/)
    assert.match(source, /readExecutableVersion\(/)
  }
})


test('runtime provider binds stored secrets to the saved normalized endpoint', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'main', 'ipc', 'runtime.ts'), 'utf8')
  assert.match(source, /normalizeApiBaseUrl\(req\.baseUrl\)/)
  assert.match(source, /isStoredApiBindingAllowed\(/)
  assert.match(source, /readSavedApiBinding\(\)/)
  assert.match(source, /baseUrl: normalizedBaseUrl, apiKeyRef:/)
  assert.doesNotMatch(source, /baseUrl: req\.baseUrl, apiKeyRef:/)
})
