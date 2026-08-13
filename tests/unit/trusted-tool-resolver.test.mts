import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  trustedExecutableCandidate, resolveNode, resolveClaude, resolveNpm,
  persistToolOverrides, loadToolOverrides, __setToolOverrideDir
} from '../../src/main/services/trusted-tool-resolver.ts'

function tempToolDir(): { root: string; nodeExe: string; npmCmd: string; claudeExe: string } {
  const root = mkdtempSync(join(tmpdir(), 'aw-tools-'))
  const nodeExe = join(root, 'node.exe')
  const npmCmd = join(root, 'npm.cmd')
  const claudeExe = join(root, 'claude.exe')
  writeFileSync(nodeExe, '', 'utf8')
  writeFileSync(npmCmd, '@echo off', 'utf8')
  writeFileSync(claudeExe, '', 'utf8')
  return { root, nodeExe, npmCmd, claudeExe }
}

test('trustedExecutableCandidate validates basename, absolute, realpath, regular file', () => {
  const fx = tempToolDir()
  assert.ok(trustedExecutableCandidate(fx.nodeExe, 'node'))
  assert.equal(trustedExecutableCandidate(fx.nodeExe, 'claude'), null) // wrong kind basename
  assert.equal(trustedExecutableCandidate('node.exe', 'node'), null) // relative
  assert.equal(trustedExecutableCandidate('\\\\server\\share\\node.exe', 'node'), null) // UNC
  assert.equal(trustedExecutableCandidate(join(fx.root, 'missing.exe'), 'node'), null) // not found
  rmSync(fx.root, { recursive: true, force: true })
})

test('override storage persists and loads node/claude', () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-ovr-'))
  __setToolOverrideDir(root)
  try {
    persistToolOverrides({ node: 'C:\\nope\\node.exe', claude: 'C:\\nope\\claude.exe' })
    const loaded = loadToolOverrides()
    assert.equal(loaded.node, 'C:\\nope\\node.exe')
    assert.equal(loaded.claude, 'C:\\nope\\claude.exe')
    persistToolOverrides({})
    assert.deepEqual(loadToolOverrides(), {})
  } finally {
    __setToolOverrideDir(null)
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveNode honors a persisted override (source=override)', () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-ovr-'))
  __setToolOverrideDir(root)
  try {
    persistToolOverrides({ node: process.execPath })
    const r = resolveNode()
    assert.equal(r.found, true)
    assert.equal(r.source, 'override')
    assert.ok(r.executable)
    assert.equal(trustedExecutableCandidate(r.executable, 'node') !== null, true)
  } finally {
    __setToolOverrideDir(null)
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveNode honors the environment candidate (source=environment)', () => {
  const prev = process.env['AGENT_WORKBENCH_NODE_EXECUTABLE']
  process.env['AGENT_WORKBENCH_NODE_EXECUTABLE'] = process.execPath
  try {
    const r = resolveNode()
    assert.equal(r.found, true)
    assert.equal(r.source, 'environment')
  } finally {
    if (prev === undefined) delete process.env['AGENT_WORKBENCH_NODE_EXECUTABLE']
    else process.env['AGENT_WORKBENCH_NODE_EXECUTABLE'] = prev
  }
})

test('resolveNpm derives from a trusted Node installation', () => {
  const fx = tempToolDir()
  // npm.cmd sits beside node.exe.
  const r = resolveNpm(fx.nodeExe)
  assert.equal(r.found, true)
  assert.equal(r.source, 'derived-from-node')
  assert.equal(r.executable, fx.npmCmd)
  rmSync(fx.root, { recursive: true, force: true })
})

test('resolveClaude honors a persisted override', () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-ovr-'))
  const claudeExe = join(root, 'claude.exe')
  writeFileSync(claudeExe, '', 'utf8')
  __setToolOverrideDir(root)
  try {
    persistToolOverrides({ claude: claudeExe })
    const r = resolveClaude()
    assert.equal(r.found, true)
    assert.equal(r.source, 'override')
  } finally {
    __setToolOverrideDir(null)
    rmSync(root, { recursive: true, force: true })
  }
})
