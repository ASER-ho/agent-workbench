import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { execFileSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let electronApp: ElectronApplication | undefined
let page: Page
let fixtureRoot = ''

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-stage-c-'))
  for (const directory of ['workspace/memory', 'workspace/skills', 'workspace/projects', 'workspace/.claude', 'settings', 'project', 'backups', 'user-data', 'temp', 'app-data', 'local-app-data']) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  const now = new Date().toISOString()
  writeFileSync(join(root, 'workspace', 'CLAUDE.md'), '# Stage C fixture\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  writeFileSync(join(root, 'workspace', 'memory', 'project-capsule.json'), JSON.stringify({
    capsuleVersion: 1,
    projectName: 'Stage C Fixture',
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

function ensureNoProcesses(marker: string): void {
  const escaped = marker.replace(/'/g, "''")
  const script = [
    "$ErrorActionPreference='Stop'", `$marker='${escaped}'`, '$matches=@()',
    'for($i=0;$i -lt 20;$i++){',
    '$matches=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($marker) })',
    'if($matches.Count -eq 0){exit 0}', 'Start-Sleep -Milliseconds 250', '}',
    '$matches | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    'throw "Stage C process leak"'
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
      AGENT_WORKBENCH_ACTION_DELAY_MS: testInfo.title.includes('while action executes') ? '1500' : '20',
      AGENT_WORKBENCH_ACTION_FILE_DELAY_MS: '0',
      AGENT_WORKBENCH_ACTION_TARGET_DELAY_MS: testInfo.title.includes('file action executes') ? '1500' : '0',
      APPDATA: join(fixtureRoot, 'app-data'), LOCALAPPDATA: join(fixtureRoot, 'local-app-data'),
      TEMP: join(fixtureRoot, 'temp'), TMP: join(fixtureRoot, 'temp'),
      SystemRoot: systemRoot, WINDIR: systemRoot,
      ComSpec: process.env.ComSpec ?? join(systemRoot, 'System32', 'cmd.exe'),
      PATH: `${join(systemRoot, 'System32')};${systemRoot}`
    }
  })
  page = await electronApp.firstWindow({ timeout: 60_000 })
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
  try {
    if (root) ensureNoProcesses(root)
    ensureNoProcesses('agent-workbench-action-stub')
  } catch (error) { teardownError ??= error }
  finally { if (root) rmSync(root, { recursive: true, force: true }) }
  if (teardownError) throw teardownError
})

/**
 * Start a running stub session through window.api.session.* IPC.
 * 0.1.2 removed the Review & Launch button, the Confirm Stub Agent Launch
 * dialog, and the ControlledActionPanel UI; the action backend requires a
 * running session bound to the same workspace label.
 */
async function startSession(): Promise<void> {
  const plan = await page.evaluate(async () => {
    return (window as any).api.session.prepareLaunch('fixture-project')
  })
  expect(plan.workspaceLabel).toBe('fixture-project')
  const snapshot = await page.evaluate(async (confirmationId) => {
    return (window as any).api.session.start(confirmationId)
  }, plan.confirmationId)
  expect(snapshot.status).toBe('running')
}

test('file proposal rejects without mutation then executes only after bound approval with evidence', async () => {
  await startSession()
  const target = join(fixtureRoot, 'workspace', 'stage-c', 'receipt-proof.txt')

  // Reject path: propose -> reject -> the target file must NOT be written.
  const proposed = await page.evaluate(async () => {
    return (window as any).api.action.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
  })
  expect(proposed.preview.kind).toBe('file_change')
  expect(proposed.preview.relativePath).toBe('stage-c/receipt-proof.txt')
  expect(proposed.preview.diff).toContain('+++ b/stage-c/receipt-proof.txt')
  const rejectBinding = {
    proposalId: proposed.proposalId,
    proposalHash: proposed.proposalHash,
    sessionId: proposed.sessionId,
    workspaceId: proposed.workspaceId
  }
  const rejected = await page.evaluate(async (binding) => (window as any).api.action.reject(binding), rejectBinding)
  expect(rejected.status).toBe('rejected')
  expect(existsSync(target)).toBe(false)

  // Approve path: propose -> approve (approved-not-executed) -> execute writes the file.
  const proposed2 = await page.evaluate(async () => {
    return (window as any).api.action.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
  })
  const approveBinding = {
    proposalId: proposed2.proposalId,
    proposalHash: proposed2.proposalHash,
    sessionId: proposed2.sessionId,
    workspaceId: proposed2.workspaceId
  }
  const approved = await page.evaluate(async (binding) => (window as any).api.action.approve(binding), approveBinding)
  expect(approved.approvalId).toBeTruthy()
  expect(existsSync(target)).toBe(false)
  const executed = await page.evaluate(async (approvalId) => (window as any).api.action.execute(approvalId), approved.approvalId)
  expect(executed.receipt.status).toBe('executed')
  expect(readFileSync(target, 'utf8')).toBe('Agent Workbench controlled action\n')

  // Execution result includes handoff + safe share evidence with no raw path.
  expect(executed.handoff).toContain('## Evidence')
  expect(executed.safeShare.markdown).toContain('# Safe Share Package')
  expect(executed.safeShare.markdown).not.toContain(fixtureRoot)
})

test('command preview exposes exact direct arguments and approval is single-consumption', async () => {
  await startSession()
  const proposed = await page.evaluate(async () => {
    return (window as any).api.action.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
  })
  expect(proposed.preview.kind).toBe('command')
  expect(proposed.preview.executable).toBeTruthy()
  expect(proposed.preview.arguments.join(' ')).toContain('controlled-action:ok')
  expect(proposed.preview.arguments.join(' ')).toContain('agent-workbench-action-stub')

  const binding = {
    proposalId: proposed.proposalId,
    proposalHash: proposed.proposalHash,
    sessionId: proposed.sessionId,
    workspaceId: proposed.workspaceId
  }
  const approval = await page.evaluate(async (b) => (window as any).api.action.approve(b), binding)
  expect(approval.approvalId).toBeTruthy()

  // Single consumption: executing the SAME approvalId twice fails the second time.
  const outcome = await page.evaluate(async (approvalId) => {
    const attempts = await Promise.allSettled([
      (window as any).api.action.execute(approvalId), (window as any).api.action.execute(approvalId)
    ])
    return attempts.map(item => item.status)
  }, approval.approvalId)
  expect(outcome.sort()).toEqual(['fulfilled', 'rejected'])
})

test('closing Electron while action executes cleans the fixed command child', async () => {
  await startSession()
  await page.evaluate(() => {
    void (async () => {
      const api = (window as any).api
      const proposal = await api.action.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
      const approval = await api.action.approve({
        proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
        sessionId: proposal.sessionId, workspaceId: proposal.workspaceId
      })
      void api.action.execute(approval.approvalId).catch(() => {})
    })()
  })
  await page.waitForTimeout(200)
  const app = electronApp!
  const child = app.process()
  electronApp = undefined
  await app.close()
  await waitForExit(child)
  ensureNoProcesses('agent-workbench-action-stub')
})

test('closing Electron while file action executes waits and prevents fixture mutation', async () => {
  await startSession()
  await page.evaluate(() => {
    void (async () => {
      const api = (window as any).api
      const proposal = await api.action.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
      const approval = await api.action.approve({
        proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
        sessionId: proposal.sessionId, workspaceId: proposal.workspaceId
      })
      void api.action.execute(approval.approvalId).catch(() => {})
    })()
  })
  await page.waitForTimeout(200)
  const target = join(fixtureRoot, 'workspace', 'stage-c', 'receipt-proof.txt')
  const app = electronApp!
  const child = app.process()
  electronApp = undefined
  await app.close()
  await waitForExit(child)
  expect(existsSync(target)).toBe(false)
})
