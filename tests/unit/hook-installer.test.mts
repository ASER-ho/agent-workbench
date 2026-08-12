import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HookInstaller } from '../../src/main/services/observation/hook-installer.ts'

function setup(settings?: Record<string, unknown>): { root: string; settingsPath: string; backupPath: string; installer: HookInstaller } {
  const root = mkdtempSync(join(tmpdir(), 'aw-hook-'))
  const settingsPath = join(root, 'settings.json')
  const backupPath = join(root, 'backup.json')
  if (settings) writeFileSync(settingsPath, JSON.stringify(settings), 'utf8')
  const installer = new HookInstaller({ settingsPath, backupPath, baseUrl: (p, t) => `http://127.0.0.1:${p}/state?token=${t}`, port: 28331, token: 'tok' })
  return { root, settingsPath, backupPath, installer }
}

test('install: writes marker entries, creates backup, preserves user hooks and other settings', () => {
  const { root, backupPath, installer } = setup({
    theme: 'dark',
    hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'user-hook' }] }] }
  })
  const r = installer.install()
  assert.equal(r.ok, true)
  assert.ok(existsSync(backupPath))
  const merged = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8'))
  assert.equal(merged.theme, 'dark')
  assert.ok(JSON.stringify(merged).includes('agent-workbench'))
  assert.ok(JSON.stringify(merged.hooks.UserPromptSubmit).includes('user-hook'))
  rmSync(root, { recursive: true, force: true })
})

test('install is idempotent: re-install does not duplicate marker entries', () => {
  const { root, installer } = setup()
  installer.install()
  const first = readFileSync(join(root, 'settings.json'), 'utf8')
  installer.install()
  const second = readFileSync(join(root, 'settings.json'), 'utf8')
  assert.equal(second, first)
  assert.ok(second.includes('agent-workbench'))
  rmSync(root, { recursive: true, force: true })
})

test('uninstall restores the backup', () => {
  const { root, settingsPath, installer } = setup({ theme: 'light' })
  installer.install()
  const r = installer.uninstall()
  assert.equal(r.ok, true)
  assert.equal(r.restored, true)
  assert.deepEqual(JSON.parse(readFileSync(settingsPath, 'utf8')), { theme: 'light' })
  rmSync(root, { recursive: true, force: true })
})

test('install refuses to overwrite a malformed settings.json', () => {
  const { root, settingsPath, installer } = setup()
  writeFileSync(settingsPath, '{ not valid json', 'utf8')
  const r = installer.install()
  assert.equal(r.ok, false)
  assert.ok(r.reason)
  rmSync(root, { recursive: true, force: true })
})

test('preview returns the full merged JSON without writing', () => {
  const { root, installer } = setup()
  const p = installer.preview()
  assert.equal(p.ok, true)
  assert.ok(p.mergedJson.length > 0)
  assert.equal(existsSync(join(root, 'settings.json')), false)
  rmSync(root, { recursive: true, force: true })
})
