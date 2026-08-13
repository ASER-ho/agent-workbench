import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ObservationManager } from '../../src/main/services/observation/observation-manager.ts'

function createManager(root: string): ObservationManager {
  return new ObservationManager({
    onSessionsChanged: () => {},
    onVerificationCompleted: () => {},
    onEvent: () => {},
    hookSettingsPath: join(root, 'settings.json'),
    hookBackupPath: join(root, 'settings.backup.json'),
    claudeProjectsDir: join(root, 'claude-projects'),
    codexSessionsDir: join(root, 'codex-sessions'),
    auditPath: join(root, 'observation-audit.jsonl')
  })
}

test('observation server start failure is fail-closed and exposes SERVER_UNAVAILABLE', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-observation-manager-server-'))
  const manager = createManager(root)
  const internal = manager as unknown as { server: { start: () => Promise<never> } }
  internal.server.start = async () => { throw new Error('fixture server failure') }
  try {
    await manager.enable()
    const status = manager.status()
    assert.equal(status.enabled, false)
    assert.equal(status.hookHealth.state, 'SERVER_UNAVAILABLE')
    assert.equal(status.hookHealth.action, 'RESTART_OBSERVATION')
  } finally {
    await manager.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('transcript watcher start failure stops the server and exposes WATCHER_ERROR', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-observation-manager-watcher-'))
  const manager = createManager(root)
  const internal = manager as unknown as { watcher: { start: () => Promise<never> } }
  internal.watcher.start = async () => { throw new Error('fixture watcher failure') }
  try {
    await manager.enable()
    const status = manager.status()
    assert.equal(status.enabled, false)
    assert.equal(status.hookHealth.state, 'WATCHER_ERROR')
    assert.equal(status.hookHealth.action, 'RESTART_OBSERVATION')
  } finally {
    await manager.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('hook confirmation returns only a display-safe backup basename across IPC boundary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-observation-manager-path-'))
  mkdirSync(join(root, 'claude-projects'), { recursive: true })
  mkdirSync(join(root, 'codex-sessions'), { recursive: true })
  const manager = createManager(root)
  try {
    await manager.enable()
    assert.equal(manager.installHooksPreview().ok, true)
    const result = manager.confirmInstallHooks()
    assert.equal(result.ok, true)
    assert.equal(result.backupPath, 'settings.backup.json')
    assert.equal(JSON.stringify(result).includes(root), false)
  } finally {
    await manager.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})
