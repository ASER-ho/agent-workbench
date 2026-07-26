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
  try {
    if (root) ensureNoProcesses(root)
    ensureNoProcesses('agent-workbench-action-stub')
  } catch (error) { teardownError ??= error }
  finally { if (root) rmSync(root, { recursive: true, force: true }) }
  if (teardownError) throw teardownError
})

async function startSession(): Promise<void> {
  await page.getByRole('button', { name: 'Review & Launch' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm Stub Agent Launch' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm & Start' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Controlled Action' })).toBeVisible()
}

test('file proposal rejects without mutation then executes only after bound approval with evidence', async () => {
  await startSession()
  const target = join(fixtureRoot, 'workspace', 'stage-c', 'receipt-proof.txt')

  await page.getByRole('button', { name: 'Review File Change' }).click()
  let dialog = page.getByRole('dialog', { name: 'Review Controlled Action' })
  await expect(dialog).toContainText('stage-c/receipt-proof.txt')
  await expect(dialog).toContainText('+++ b/stage-c/receipt-proof.txt')
  await dialog.getByRole('button', { name: 'Reject' }).click()
  await expect(page.getByText('Rejected — not executed', { exact: false })).toBeVisible()
  expect(existsSync(target)).toBe(false)

  await page.getByRole('button', { name: 'Review File Change' }).click()
  dialog = page.getByRole('dialog', { name: 'Review Controlled Action' })
  await dialog.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Approved — not executed', { exact: false })).toBeVisible()
  expect(existsSync(target)).toBe(false)
  await page.getByRole('button', { name: 'Execute Approved' }).click()
  await expect(page.getByText('Executed', { exact: false }).first()).toBeVisible()
  expect(readFileSync(target, 'utf8')).toBe('Agent Workbench controlled action\n')

  await page.getByText('Markdown Handoff', { exact: true }).click()
  await expect(page.locator('details').filter({ hasText: 'Markdown Handoff' })).toContainText('## Evidence')
  await page.getByText('Safe Share Package', { exact: true }).click()
  const share = page.locator('details').filter({ hasText: 'Safe Share Package' })
  await expect(share).toContainText('# Safe Share Package')
  await expect(share).not.toContainText(fixtureRoot)
})

test('command preview exposes exact direct arguments and approval is single-consumption', async () => {
  await startSession()
  await page.getByRole('button', { name: 'Review Command' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review Controlled Action' })
  await expect(dialog).toContainText('Executable')
  await expect(dialog).toContainText('controlled-action:ok')
  await expect(dialog).toContainText('agent-workbench-action-stub')
  await dialog.getByRole('button', { name: 'Approve' }).click()

  const outcome = await page.evaluate(async () => {
    const receipts = await window.api.action.getReceipts()
    const approved = receipts.at(-1)!
    const proposal = await window.api.action.propose({ actionType: 'command', workspaceLabel: approved.workspaceLabel })
    const approval = await window.api.action.approve({
      proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
      sessionId: proposal.sessionId, workspaceId: proposal.workspaceId
    })
    const attempts = await Promise.allSettled([
      window.api.action.execute(approval.approvalId), window.api.action.execute(approval.approvalId)
    ])
    return attempts.map(item => item.status)
  })
  expect(outcome.sort()).toEqual(['fulfilled', 'rejected'])
})

test('closing Electron while action executes cleans the fixed command child', async () => {
  await startSession()
  await page.getByRole('button', { name: 'Review Command' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review Controlled Action' })
  await dialog.getByRole('button', { name: 'Approve' }).click()
  await page.evaluate(() => {
    void (async () => {
      const receipts = await window.api.action.getReceipts()
      const approved = receipts.at(-1)
      if (!approved) return
      const proposal = await window.api.action.propose({ actionType: 'command', workspaceLabel: approved.workspaceLabel })
      const approval = await window.api.action.approve({
        proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
        sessionId: proposal.sessionId, workspaceId: proposal.workspaceId
      })
      void window.api.action.execute(approval.approvalId).catch(() => {})
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
      const proposal = await window.api.action.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
      const approval = await window.api.action.approve({
        proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
        sessionId: proposal.sessionId, workspaceId: proposal.workspaceId
      })
      void window.api.action.execute(approval.approvalId).catch(() => {})
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
