import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import test from 'node:test'

import { findPrivatePathMatches, scanPrivatePaths } from '../../scripts/private-path-scan.mjs'

test('detects raw, forward-slash and JavaScript-escaped private paths', () => {
  const raw = join(tmpdir(), 'agent-workbench-private-fixture', 'workspace')
  const forward = raw.replace(/\\/g, '/')
  const escaped = raw.replace(/\\/g, '\\\\')
  const matches = findPrivatePathMatches(`${raw}\n${forward}\n${escaped}`)
  const kinds = new Set(matches.map((match) => match.kind))

  assert.equal(kinds.has('raw-windows-path'), true)
  assert.equal(kinds.has('forward-windows-path'), true)
  assert.equal(kinds.has('javascript-escaped-windows-path'), true)
})

test('Windows path matching is case insensitive and excludes generic system roots', () => {
  const root = parse(tmpdir()).root
  const userPath = join(tmpdir(), 'MiXeD-Private-Path').toUpperCase()
  const systemPath = join(root, 'Windows', 'Temp')

  assert.equal(findPrivatePathMatches(userPath).length > 0, true)
  assert.equal(findPrivatePathMatches(systemPath).length, 0)
})

test('detects a configured local username without embedding a real username', () => {
  const syntheticUsername = ['Synthetic', 'Local', 'User'].join('')
  const matches = findPrivatePathMatches(`owner=${syntheticUsername}`, {
    usernames: [syntheticUsername]
  })
  assert.equal(matches.some((match) => match.kind === 'local-username'), true)
})

test('scanner reads temporary files and reports escaped path findings', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-private-scan-'))
  try {
    const privatePath = join(root, 'workspace').replace(/\\/g, '\\\\')
    const file = join(root, 'bundle.js')
    writeFileSync(file, `const workspace = "${privatePath}"\n`, 'utf8')

    const result = scanPrivatePaths([root])
    assert.equal(result.filesScanned, 1)
    assert.equal(result.findings.length, 1)
    assert.equal(result.findings[0].matches[0].kind, 'javascript-escaped-windows-path')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
