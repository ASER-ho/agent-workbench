import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { execFileSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let electronApp: ElectronApplication | undefined
let page: Page
let fixtureRoot = ''

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-stage-b-'))
  for (const directory of ['workspace/memory', 'workspace/skills', 'workspace/projects', 'workspace/.claude', 'settings', 'project', 'backups', 'user-data', 'temp', 'app-data', 'local-app-data']) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  const now = new Date().toISOString()
  writeFileSync(join(root, 'workspace', 'CLAUDE.md'), '# Stage B fixture\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  writeFileSync(join(root, 'workspace', 'memory', 'project-capsule.json'), JSON.stringify({
    capsuleVersion: 1,
    projectName: 'Stage B Fixture',
    workspaceLabel: 'fixture-project',
    safePathLabel: 'fixture-project',
    lastOpenedAt: now,
    safetyState: {
      providerStatus: 'default', secretsSafe: true, pathsSafe: true, releaseBlocked: true,
      buildStatus: 'pass', packStatus: 'blocked', phaseStatus: 'phase-1-active', workspaceSelected: true
    },
    notes: '', createdAt: now, updatedAt: now
  }, null, 2), 'utf8')
  return root
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  await new Promise<void>((resolveExit, reject) => {
    const timeout = setTimeout(() => reject(new Error('Electron process did not exit')), 10_000)
    child.once('exit', () => { clearTimeout(timeout); resolveExit() })
  })
}

function ensureNoFixtureProcesses(marker: string): void {
  const escaped = marker.replace(/'/g, "''")
  const script = [
    "$ErrorActionPreference='Stop'", `$marker='${escaped}'`, '$matches=@()',
    'for($i=0;$i -lt 20;$i++){',
    '$matches=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($marker) })',
    'if($matches.Count -eq 0){exit 0}', 'Start-Sleep -Milliseconds 250', '}',
    '$matches | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    'throw "Stage B fixture process leak"'
  ].join('; ')
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'pipe' })
}

test.beforeEach(async ({}, testInfo) => {
  fixtureRoot = createFixture()
  const repoRoot = resolve(process.cwd())
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  electronApp = await electron.launch({
    executablePath: join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: ['.', `--user-data-dir=${join(fixtureRoot, 'user-data')}`],
    cwd: repoRoot,
    env: {
      AGENT_WORKBENCH_E2E: '1', AGENT_WORKBENCH_FIXTURE_ROOT: fixtureRoot,
      AGENT_WORKBENCH_STUB_TIMEOUT_MS: '180', USERPROFILE: fixtureRoot,
      AGENT_WORKBENCH_STUB_START_DELAY_MS: testInfo.title.includes('while starting') ? '1500' : '0',
      APPDATA: join(fixtureRoot, 'app-data'), LOCALAPPDATA: join(fixtureRoot, 'local-app-data'),
      TEMP: join(fixtureRoot, 'temp'), TMP: join(fixtureRoot, 'temp'),
      SystemRoot: systemRoot, WINDIR: systemRoot,
      ComSpec: process.env.ComSpec ?? join(systemRoot, 'System32', 'cmd.exe'),
      PATH: `${join(systemRoot, 'System32')};${systemRoot}`
    }
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => localStorage.setItem('agent-workbench-locale', 'en'))
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
})

test.afterEach(async () => {
  const root = fixtureRoot
  fixtureRoot = ''
  let teardownError: unknown
  if (electronApp) {
    const app = electronApp
    const child = app.process()
    electronApp = undefined
    try { await app.close(); await waitForExit(child); expect(child.exitCode).not.toBeNull() }
    catch (error) { teardownError = error }
  }
  try { if (root) ensureNoFixtureProcesses(root) }
  catch (error) { teardownError ??= error }
  finally { if (root) rmSync(root, { recursive: true, force: true }) }
  if (teardownError) throw teardownError
})

async function startThroughDialog(): Promise<void> {
  await expect(page.getByText('fixture-project', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Review & Launch' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm Stub Agent Launch' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Deterministic Stub Agent')
  await expect(dialog).toContainText('Local Stub')
  await expect(dialog).toContainText('deterministic-v1')
  const confirm = dialog.getByRole('button', { name: 'Confirm & Start' })
  await expect(confirm).toBeFocused()
  await confirm.click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
}

test('confirmation starts the stub, streams input, rejects duplicates, and stops', async () => {
  expect(await page.evaluate(() => typeof (window as any).api.terminal.start)).toBe('undefined')
  await page.evaluate(() => {
    ;(window as any).__stageBOutput = ''
    ;(window as any).__stageBUnsub = (window as any).api.session.onData((data: string) => { (window as any).__stageBOutput += data })
  })
  await startThroughDialog()
  const duplicate = await page.evaluate(async () => {
    try { await (window as any).api.session.prepareLaunch('fixture-project'); return 'unexpected-success' }
    catch (error) { return String(error) }
  })
  expect(duplicate).toMatch(/active session/i)
  await page.evaluate(() => (window as any).api.session.input('hello stage b e2e'))
  await expect.poll(() => page.evaluate(() => (window as any).__stageBOutput)).toContain('hello stage b e2e')
  await page.getByRole('button', { name: 'Stop Session' }).click()
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
  const status = await page.evaluate(() => (window as any).api.session.getStatus())
  expect(status.pid).toBeUndefined()
})

test('capsule updates refresh the launch gate and confirmation workspace', async () => {
  const review = page.getByRole('button', { name: 'Review & Launch' })
  await page.getByRole('button', { name: 'Edit Capsule' }).click()
  await page.getByRole('textbox', { name: 'Location' }).fill('(not set)')
  await page.getByRole('button', { name: 'Save Capsule' }).click()
  await expect(review).toBeDisabled()

  await page.getByRole('button', { name: 'Edit Capsule' }).click()
  await page.getByRole('textbox', { name: 'Location' }).fill('updated-fixture-project')
  await page.getByRole('button', { name: 'Save Capsule' }).click()
  await expect(review).toBeEnabled()
  await review.click()
  const dialog = page.getByRole('dialog', { name: 'Confirm Stub Agent Launch' })
  await expect(dialog).toContainText('updated-fixture-project')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
})

test('crash recovery and timeout are observable through production IPC', async () => {
  await startThroughDialog()
  await page.evaluate(() => (window as any).api.session.input('__CRASH__'))
  await expect.poll(async () => (await page.evaluate(() => (window as any).api.session.getStatus())).status).toBe('crashed')
  const recovered = await page.evaluate(async () => {
    const api = (window as any).api.session
    const plan = await api.prepareLaunch('fixture-project')
    return api.start(plan.confirmationId)
  })
  expect(recovered.status).toBe('running')
  await page.evaluate(() => (window as any).api.session.input('__TIMEOUT__'))
  await expect.poll(async () => (await page.evaluate(() => (window as any).api.session.getStatus())).status).toBe('timed_out')
  const finalStatus = await page.evaluate(() => (window as any).api.session.getStatus())
  expect(finalStatus.pid).toBeUndefined()
  expect(finalStatus.reason).toBe('response_timeout')
})

test('closing Electron while the stub runs leaves no fixture process', async () => {
  await startThroughDialog()
  await expect(page.getByRole('button', { name: 'Stop Session' })).toBeVisible()
})

test('closing Electron while starting leaves no fixture process', async () => {
  const confirmationId = await page.evaluate(async () => {
    const plan = await (window as any).api.session.prepareLaunch('fixture-project')
    return plan.confirmationId
  })
  await page.evaluate((id) => {
    void (window as any).api.session.start(id).catch(() => undefined)
  }, confirmationId)
  await expect.poll(async () => (await page.evaluate(() => (window as any).api.session.getStatus())).status).toBe('starting')
})
