import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HookInstaller, readInstalledHookEndpoint } from '../../src/main/services/observation/hook-installer.ts'

function setup(settings?: Record<string, unknown>): { root: string; settingsPath: string; backupPath: string; installer: HookInstaller } {
  const root = mkdtempSync(join(tmpdir(), 'aw-hook-'))
  const settingsPath = join(root, 'settings.json')
  const backupPath = join(root, 'backup.json')
  if (settings) writeFileSync(settingsPath, JSON.stringify(settings), 'utf8')
  const installer = new HookInstaller({ settingsPath, backupPath, baseUrl: (p, t) => `http://127.0.0.1:${p}/state?token=${t}`, port: 28331, token: 'a'.repeat(32) })
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

test('uninstall precisely removes AW hooks and preserves user edits made after install', () => {
  const { root, settingsPath, installer } = setup({ theme: 'light' })
  installer.install()
  // User adds their own hook + changes a setting AFTER we installed.
  const afterInstall = JSON.parse(readFileSync(settingsPath, 'utf8'))
  afterInstall.theme = 'dark'
  afterInstall.hooks.UserPromptSubmit.push({ hooks: [{ type: 'command', command: 'user-later-hook' }] })
  writeFileSync(settingsPath, JSON.stringify(afterInstall), 'utf8')

  const r = installer.uninstall()
  assert.equal(r.ok, true)
  assert.equal(r.restored, false) // precise removal, not backup restore

  const final = JSON.parse(readFileSync(settingsPath, 'utf8'))
  assert.equal(final.theme, 'dark') // user's later edit preserved
  assert.ok(!JSON.stringify(final).includes('agent-workbench')) // AW hooks gone
  // user's later hook preserved
  assert.ok(JSON.stringify(final.hooks.UserPromptSubmit).includes('user-later-hook'))
  rmSync(root, { recursive: true, force: true })
})

test('uninstall removes only the AW entry when a group also contains a user hook', () => {
  const { root, settingsPath, installer } = setup({ theme: 'light' })
  installer.install()
  const afterInstall = JSON.parse(readFileSync(settingsPath, 'utf8'))
  const awEntry = afterInstall.hooks.SessionEnd[0].hooks[0]
  afterInstall.hooks.SessionEnd[0].hooks.push({ type: 'command', command: 'user-hook-in-same-group' })
  assert.ok(JSON.stringify(awEntry).includes('agent-workbench'))
  writeFileSync(settingsPath, JSON.stringify(afterInstall), 'utf8')

  const result = installer.uninstall()
  assert.deepEqual(result, { ok: true, restored: false })
  const final = JSON.parse(readFileSync(settingsPath, 'utf8'))
  assert.ok(JSON.stringify(final.hooks.SessionEnd).includes('user-hook-in-same-group'))
  assert.ok(!JSON.stringify(final).includes('agent-workbench'))
  rmSync(root, { recursive: true, force: true })
})

test('uninstall restores from backup only when the current settings are corrupt', () => {
  const { root, settingsPath, installer } = setup({ theme: 'light' })
  installer.install()
  // Simulate catastrophic corruption of the current settings.
  writeFileSync(settingsPath, '{ broken', 'utf8')
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
  assert.ok(p.mergedJson.includes(`token=${'a'.repeat(32)}`))
  assert.ok(!p.displayJson.includes(`token=${'a'.repeat(32)}`))
  assert.ok(p.displayJson.includes('token=[REDACTED]'))
  assert.equal(existsSync(join(root, 'settings.json')), false)
  rmSync(root, { recursive: true, force: true })
})

test('installed endpoint health requires every AW entry to match the active endpoint', () => {
  const { root, settingsPath, installer } = setup()
  installer.install()
  assert.deepEqual(installer.inspectEndpoint(), { installed: true, matchesActiveEndpoint: true, reason: null })

  const stale = JSON.parse(readFileSync(settingsPath, 'utf8'))
  stale.hooks.SessionEnd[0].hooks[0].url = 'http://127.0.0.1:29999/state?token=old&src=agent-workbench'
  writeFileSync(settingsPath, JSON.stringify(stale), 'utf8')
  assert.equal(installer.inspectEndpoint().reason, 'ENDPOINT_MISMATCH')
  rmSync(root, { recursive: true, force: true })
})

test('restart recovers a valid installed token and port without exposing them', () => {
  const { root, settingsPath, installer } = setup()
  installer.install()
  assert.deepEqual(readInstalledHookEndpoint(settingsPath), { port: 28331, token: 'a'.repeat(32) })
  rmSync(root, { recursive: true, force: true })
})

test('repair preview does not modify stale hooks; confirm changes only AW entries', () => {
  const { root, settingsPath, backupPath } = setup({
    hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'user-hook' }] }] }
  })
  const oldInstaller = new HookInstaller({ settingsPath, backupPath, baseUrl: (p, t) => `http://127.0.0.1:${p}/state?token=${t}`, port: 28331, token: 'oldtoken' })
  oldInstaller.install()
  const before = readFileSync(settingsPath, 'utf8')
  const currentInstaller = new HookInstaller({ settingsPath, backupPath, baseUrl: (p, t) => `http://127.0.0.1:${p}/state?token=${t}`, port: 29999, token: 'newtoken' })
  assert.equal(currentInstaller.inspectEndpoint().reason, 'ENDPOINT_MISMATCH')
  currentInstaller.preview()
  assert.equal(readFileSync(settingsPath, 'utf8'), before)
  currentInstaller.install()
  const after = readFileSync(settingsPath, 'utf8')
  assert.ok(after.includes('user-hook'))
  assert.ok(after.includes(':29999/state?token=newtoken'))
  assert.ok(!after.includes('token=oldtoken'))
  rmSync(root, { recursive: true, force: true })
})
