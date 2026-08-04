import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { isUncOrDevicePath } from '../../src/main/services/workspace-foundation/path-validation.ts'
import { createWorkspaceBinding } from '../../src/main/services/workspace-foundation/session-workspace.ts'
import { verifyWorkspacePath } from '../../src/main/services/workspace-foundation/workspace-selection.ts'

test('isUncOrDevicePath rejects UNC, extended, and device paths', () => {
  assert.equal(isUncOrDevicePath('\\\\server\\share\\x'), true, 'UNC')
  assert.equal(isUncOrDevicePath('\\\\?\\UNC\\server\\share'), true, 'extended UNC')
  assert.equal(isUncOrDevicePath('\\\\?\\C:\\private'), true, 'extended local')
  assert.equal(isUncOrDevicePath('\\\\.\\pipe\\name'), true, 'device namespace')
  assert.equal(isUncOrDevicePath('C:\\windows\\x'), false, 'plain local drive')
  assert.equal(isUncOrDevicePath('D:/x/y'), false, 'forward-slash drive path')
})

test('verifyWorkspacePath accepts a real local directory and rejects UNC/device/non-dir', () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-wf-'))
  try {
    const verified = verifyWorkspacePath(root)
    assert.ok(verified, 'real directory accepted')
    assert.equal(verifyWorkspacePath('\\\\server\\share'), null, 'UNC rejected')
    assert.equal(verifyWorkspacePath('\\\\.\\pipe\\x'), null, 'device rejected')
    assert.equal(verifyWorkspacePath(''), null, 'empty rejected')
    assert.equal(verifyWorkspacePath('relative/path'), null, 'relative rejected')
    assert.equal(verifyWorkspacePath(join(root, 'nonexistent')), null, 'nonexistent rejected')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('createWorkspaceBinding produces stable identity for the same path', () => {
  const root = mkdtempSync(join(tmpdir(), 'aw-wf-'))
  try {
    const a = createWorkspaceBinding(root)
    const b = createWorkspaceBinding(root)
    assert.equal(a.workspaceId, b.workspaceId, 'same path -> same workspaceId')
    assert.equal(a.workspaceDisplayId, b.workspaceDisplayId, 'same path -> same displayId')
    assert.ok(a.workspaceId.startsWith('ws_'), 'workspaceId prefix ws_')
    assert.ok(a.workspaceDisplayId.includes('#'), 'displayId contains hash marker')
    assert.equal(a.cwd, b.cwd, 'cwd equal')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
