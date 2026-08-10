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

/**
 * Start the stub session entirely through window.api.session.* IPC.
 * The 0.1.2 shell removed the Review & Launch button and the
 * Confirm Stub Agent Launch dialog, so the session backend is driven directly.
 */
async function startStubSession(): Promise<void> {
  const plan = await page.evaluate(async () => {
    return (window as any).api.session.prepareLaunch('fixture-project')
  })
  expect(plan.workspaceLabel).toBe('fixture-project')
  const snapshot = await page.evaluate(async (confirmationId) => {
    return (window as any).api.session.start(confirmationId)
  }, plan.confirmationId)
  expect(snapshot.status).toBe('running')
}

test('confirmation starts the stub, streams input, rejects duplicates, and stops', async () => {
  expect(await page.evaluate(() => typeof (window as any).api.terminal.start)).toBe('undefined')
  await page.evaluate(() => {
    ;(window as any).__stageBOutput = ''
    ;(window as any).__stageBUnsub = (window as any).api.session.onData((data: string) => { (window as any).__stageBOutput += data })
  })
  await startStubSession()

  const duplicate = await page.evaluate(async () => {
    try { await (window as any).api.session.prepareLaunch('fixture-project'); return 'unexpected-success' }
    catch (error) { return String(error) }
  })
  expect(duplicate).toMatch(/active session/i)

  await page.evaluate(() => (window as any).api.session.input('hello stage b e2e'))
  await expect.poll(() => page.evaluate(() => (window as any).__stageBOutput)).toContain('hello stage b e2e')

  const stopped = await page.evaluate(() => (window as any).api.session.stop())
  expect(stopped.status).toBe('stopped')
  const status = await page.evaluate(() => (window as any).api.session.getStatus())
  expect(status.pid).toBeUndefined()
})

test('capsule updates refresh the launch gate and confirmation workspace', async () => {
  // 0.1.2 hides the Edit Capsule / Save Capsule UI and the Review & Launch
  // dialog; drive capsule.save + session.prepareLaunch/start via IPC to
  // preserve the workspace-binding behavior.

  // (1) An unsafe/unselected workspace keeps the launch gate closed.
  await page.evaluate(async () => {
    const now = new Date().toISOString()
    return (window as any).api.capsule.save({
      capsuleVersion: 1,
      projectName: 'Stage B Fixture',
      workspaceLabel: '',
      safePathLabel: '(not set)',
      lastOpenedAt: now,
      safetyState: {
        providerStatus: 'default', secretsSafe: true, pathsSafe: false, releaseBlocked: true,
        buildStatus: 'pass', packStatus: 'blocked', phaseStatus: 'phase-1-active', workspaceSelected: false
      },
      notes: '', createdAt: now, updatedAt: now
    })
  })
  const gated = await page.evaluate(async () => {
    try { await (window as any).api.session.prepareLaunch('Current Workspace'); return 'unexpected-success' }
    catch (error) { return String(error) }
  })
  expect(gated).toMatch(/session readiness failed|readiness failed/i)

  // (2) After the capsule is updated to a safe label, the launch plan carries it.
  await page.evaluate(async () => {
    const now = new Date().toISOString()
    return (window as any).api.capsule.save({
      capsuleVersion: 1,
      projectName: 'Stage B Fixture',
      workspaceLabel: 'updated-fixture-project',
      safePathLabel: 'updated-fixture-project',
      lastOpenedAt: now,
      safetyState: {
        providerStatus: 'default', secretsSafe: true, pathsSafe: true, releaseBlocked: true,
        buildStatus: 'pass', packStatus: 'blocked', phaseStatus: 'phase-1-active', workspaceSelected: true
      },
      notes: '', createdAt: now, updatedAt: now
    })
  })
  const plan = await page.evaluate(async () => (window as any).api.session.prepareLaunch('updated-fixture-project'))
  expect(plan.workspaceLabel).toBe('updated-fixture-project')
  const snapshot = await page.evaluate(async (confirmationId) => (window as any).api.session.start(confirmationId), plan.confirmationId)
  expect(snapshot.status).toBe('running')
  expect(snapshot.workspaceLabel).toBe('updated-fixture-project')
  await page.evaluate(() => (window as any).api.session.stop())
})

test('crash recovery and timeout are observable through production IPC', async () => {
  await startStubSession()
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
  await startStubSession()
  const status = await page.evaluate(() => (window as any).api.session.getStatus())
  expect(status.status).toBe('running')
  // afterEach closes the app; the before-quit handler disposes the stub child.
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
