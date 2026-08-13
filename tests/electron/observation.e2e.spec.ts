import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { resolveWhereGitExecutable } from '../../src/main/services/git-verification'

let app: ElectronApplication | undefined
let page: Page
let root = ''
let workspace = ''
let workspaceB = ''

const CONTRACT = {
  title: 'Observation E2E', goal: 'Verify the fixture', allowedPaths: ['src'],
  forbiddenPaths: [], acceptanceCriteria: ['fixture passes'], knownRisks: ['fixture-only execution']
}

test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aw-observation-electron-'))
  workspace = join(root, 'workspace')
  workspaceB = join(root, 'workspace-b')
  const git = resolveWhereGitExecutable()
  if (!git) throw new Error('E2E requires a trusted git.exe')
  for (const directory of ['src', 'test', '.claude', 'memory', 'skills', 'projects']) mkdirSync(join(workspace, directory), { recursive: true })
  for (const directory of ['settings', 'project', 'backups', 'user-data', 'temp', 'app-data', 'local-app-data']) mkdirSync(join(root, directory), { recursive: true })
  mkdirSync(workspaceB, { recursive: true })
  writeFileSync(join(workspace, 'src', 'fixture.txt'), 'fixture\n', 'utf8')
  writeFileSync(join(workspace, 'test', 'verify.spec.mjs'), "import test from 'node:test'; test('fixture', () => {})\n", 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  execFileSync(git, ['init', '-b', 'main'], { cwd: workspace })
  execFileSync(git, ['config', 'user.name', 'Observation E2E'], { cwd: workspace })
  execFileSync(git, ['config', 'user.email', 'observation@localhost.invalid'], { cwd: workspace })
  execFileSync(git, ['add', '--all'], { cwd: workspace })
  execFileSync(git, ['commit', '-m', 'fixture'], { cwd: workspace })

  const repoRoot = resolve(process.cwd())
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  app = await electron.launch({
    executablePath: join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: ['.', `--user-data-dir=${join(root, 'user-data')}`], cwd: repoRoot,
    env: {
      AGENT_WORKBENCH_E2E: '1', AGENT_WORKBENCH_FIXTURE_ROOT: root,
      AGENT_WORKBENCH_E2E_GIT_EXECUTABLE: git,
      AGENT_WORKBENCH_NODE_EXECUTABLE: process.execPath,
      USERPROFILE: root, APPDATA: join(root, 'app-data'), LOCALAPPDATA: join(root, 'local-app-data'),
      TEMP: join(root, 'temp'), TMP: join(root, 'temp'), SystemRoot: systemRoot, WINDIR: systemRoot,
      ComSpec: process.env.ComSpec ?? join(systemRoot, 'System32', 'cmd.exe'), PATH: `${join(systemRoot, 'System32')};${systemRoot}`
    }
  })
  page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
  const navButtons = page.getByRole('navigation', { name: 'Primary' }).getByRole('button')
  await navButtons.nth(2).click()
  await page.getByRole('button', { name: /EN/ }).click()
  await expect(page.getByText('Passive Observation')).toBeVisible()
})

test.afterEach(async () => {
  if (app) await app.close().catch(() => undefined)
  app = undefined
  if (root) rmSync(root, { recursive: true, force: true })
})

test('observation defaults off, arms a visible single-use lease, revokes on workspace change, and never exposes Hook token', async () => {
  await expect(page.getByRole('button', { name: 'Enable observation' })).toBeVisible()
  await expect(page.getByText('Hooks not installed')).toBeVisible()
  await page.getByRole('button', { name: 'Enable observation' }).click()
  await expect(page.getByRole('button', { name: 'Disable observation' })).toBeVisible()
  await expect(page.getByText(/Watched dirs:/)).toBeVisible()

  const digestPrefix = await page.evaluate(async ({ contract }) => {
    const preview = await window.api.controlledVerification.preview({
      testPath: 'test/verify.spec.mjs',
      contract: { ...contract, goal: `  ${contract.goal}  ` }
    })
    return preview.contractDigest.slice(0, 12)
  }, { contract: CONTRACT })
  await page.getByRole('button', { name: 'Authorize once' }).click()
  await expect(page.getByText('Authorized (single use)')).toBeVisible()
  await expect(page.getByText(/authorization runs once/)).toBeVisible()
  await expect(page.getByText(/Project default check/)).toBeVisible()
  await expect(page.getByText(/Session end/)).toBeVisible()
  await expect(page.getByText(`Contract digest: ${digestPrefix}`)).toBeVisible()

  if (!app) throw new Error('Electron app unavailable')
  await app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target], bookmarks: [] })
  }, workspaceB)
  const changed = await page.evaluate(() => window.api.workspaceSelection.choose())
  expect(changed.cancelled).toBe(false)
  await expect(page.getByText(/Auto-verification revoked.*workspace changed/)).toBeVisible()

  await page.getByRole('button', { name: 'Install hooks' }).click()
  const preview = page.locator('pre')
  await expect(preview).toContainText('token=[REDACTED]')
  await expect(preview).not.toContainText(/token=[a-f0-9]{32}/)
  assertNoFullToken(await page.locator('body').innerText())
})

test('disable observation revokes an armed lease and stops server-facing state', async () => {
  await page.getByRole('button', { name: 'Enable observation' }).click()
  await page.evaluate(async ({ contract }) => {
    await window.api.controlledVerification.preview({ testPath: 'test/verify.spec.mjs', contract })
  }, { contract: CONTRACT })
  await page.getByRole('button', { name: 'Authorize once' }).click()
  await page.getByRole('button', { name: 'Disable observation' }).click()
  await expect(page.getByText(/Auto-verification revoked.*observation disabled/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enable observation' })).toBeVisible()

  const audit = readFileSync(join(root, 'user-data', 'observation-audit.jsonl'), 'utf8')
  expect(audit).toContain('authorization_granted')
  expect(audit).toContain('authorization_revoked')
  expect(audit).not.toContain(workspace)
})

test('matching session:end consumes once, completes auto verification, and surfaces trigger provenance', async () => {
  await page.getByRole('button', { name: 'Enable observation' }).click()
  await page.evaluate(async ({ contract }) => {
    await window.api.controlledVerification.preview({ testPath: 'test/verify.spec.mjs', contract })
  }, { contract: CONTRACT })
  await page.getByRole('button', { name: 'Authorize once' }).click()

  await page.getByRole('button', { name: 'Install hooks' }).click()
  await page.getByRole('button', { name: 'Confirm install' }).click()
  await expect(page.getByText('Hooks installed and healthy')).toBeVisible()

  const settingsPath = join(root, '.claude', 'settings.json')
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
  const hookUrl = settings.hooks.SessionEnd[0].hooks[0].url as string
  const sendSessionEnd = async (): Promise<void> => {
    const response = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 'auto-session-e2e', cwd: workspace })
    })
    expect(response.status).toBe(200)
  }

  await sendSessionEnd()
  await expect(page.getByText('Authorization consumed; auto-verification is off.')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/Last receipt: auto \(session ended\)/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Authorize once' })).toBeVisible()

  const auditPath = join(root, 'user-data', 'observation-audit.jsonl')
  await expect.poll(() => readFileSync(auditPath, 'utf8')).toContain('auto_run_completed')
  const beforeDuplicate = readFileSync(auditPath, 'utf8')
  expect((beforeDuplicate.match(/"event":"auto_run_started"/g) ?? []).length).toBe(1)
  expect(beforeDuplicate).not.toContain('auto-session-e2e')
  expect(beforeDuplicate).not.toContain(workspace)

  await sendSessionEnd()
  await page.waitForTimeout(250)
  const afterDuplicate = readFileSync(auditPath, 'utf8')
  expect((afterDuplicate.match(/"event":"auto_run_started"/g) ?? []).length).toBe(1)
})

test('stale installed endpoint becomes visibly drifted and repair stays preview-before-confirm', async () => {
  await page.getByRole('button', { name: 'Enable observation' }).click()
  await page.evaluate(async ({ contract }) => {
    await window.api.controlledVerification.preview({ testPath: 'test/verify.spec.mjs', contract })
  }, { contract: CONTRACT })
  await page.getByRole('button', { name: 'Authorize once' }).click()
  await page.getByRole('button', { name: 'Install hooks' }).click()
  await page.getByRole('button', { name: 'Confirm install' }).click()
  await expect(page.getByText('Hooks installed and healthy')).toBeVisible()

  const settingsPath = join(root, '.claude', 'settings.json')
  const drifted = JSON.parse(readFileSync(settingsPath, 'utf8'))
  drifted.userSetting = 'preserve-me'
  const staleUrl = new URL(drifted.hooks.SessionEnd[0].hooks[0].url)
  staleUrl.port = staleUrl.port === '65535' ? '65534' : String(Number(staleUrl.port) + 1)
  drifted.hooks.SessionEnd[0].hooks[0].url = staleUrl.toString()
  writeFileSync(settingsPath, JSON.stringify(drifted, null, 2), 'utf8')

  // Contract replacement revokes the lease and pushes a fresh status, which
  // must inspect the currently installed endpoint rather than marker presence.
  await page.evaluate(async ({ contract }) => {
    await window.api.controlledVerification.preview({
      testPath: 'test/verify.spec.mjs',
      contract: { ...contract, goal: 'changed to refresh status' }
    })
  }, { contract: CONTRACT })
  await expect(page.getByText('Hook configuration drift detected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview Hook update' })).toBeVisible()

  const beforePreview = readFileSync(settingsPath, 'utf8')
  await page.getByRole('button', { name: 'Preview Hook update' }).click()
  await expect(page.getByRole('button', { name: 'Confirm install' })).toBeVisible()
  expect(readFileSync(settingsPath, 'utf8')).toBe(beforePreview)

  await page.getByRole('button', { name: 'Confirm install' }).click()
  await expect(page.getByText('Hooks installed and healthy')).toBeVisible()
  const repaired = JSON.parse(readFileSync(settingsPath, 'utf8'))
  expect(repaired.userSetting).toBe('preserve-me')
  assertNoFullToken(await page.locator('body').innerText())
})

function assertNoFullToken(text: string): void {
  expect(text).not.toMatch(/[?&]token=[a-f0-9]{32}/i)
}
