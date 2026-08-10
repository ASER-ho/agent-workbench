import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { resolveWhereGitExecutable } from '../../src/main/services/git-verification'

let app: ElectronApplication | undefined
let page: Page
let root = ''
let git = ''
let workspace = ''
let exportDir = ''

const PASSING_TEST = [
  "import test from 'node:test'",
  "import assert from 'node:assert/strict'",
  "test('example passes', () => { assert.equal(1 + 1, 2) })",
  ''
].join('\n')

const FAILING_TEST = [
  "import test from 'node:test'",
  "import assert from 'node:assert/strict'",
  "test('example fails', () => { assert.equal(1 + 1, 3) })",
  ''
].join('\n')

function findGit(): string {
  const resolved = resolveWhereGitExecutable()
  if (!resolved) throw new Error('E2E requires a trusted git.exe')
  return resolved
}

function runGit(cwd: string, args: string[]): void {
  execFileSync(git, args, { cwd, stdio: 'pipe', windowsHide: true })
}

function workbench() {
  return page.getByRole('region', { name: '只读验收' })
}

function resultRegion() {
  // 0.1.2-C Result Workbench region.
  return page.getByRole('region', { name: '验证结果工作面' })
}

async function fillContract(testName: string): Promise<void> {
  const verification = workbench()
  await verification.getByLabel('任务标题').fill('R2D 闭环验收')
  await verification.getByLabel('目标').fill('确认固定 node --test 通过并导出回执。')
  await verification.getByLabel('允许路径').fill('src\ntest')
  await verification.getByLabel('禁止路径').fill('.git')
  await verification.getByRole('group', { name: '验收标准' }).getByLabel('验收标准 1').fill('测试通过并生成回执')
  await verification.getByRole('group', { name: '已知风险' }).getByLabel('已知风险 1').fill('仅运行固定测试命令')
  await verification.getByLabel('验证方法').fill(testName)
}

async function runToResult(testName: string): Promise<void> {
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await fillContract(testName)
  await page.getByRole('button', { name: '确认并继续' }).click()
  const review = page.getByRole('region', { name: '执行预览' })
  await expect(review.getByText('固定命令', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '一次确认并执行' }).click()
}

test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aw-r2d-electron-'))
  git = findGit()
  workspace = join(root, 'workspace')
  exportDir = join(root, 'exports')
  for (const dir of ['src', 'test', 'docs', '.claude']) mkdirSync(join(workspace, dir), { recursive: true })
  for (const dir of ['settings', 'project', 'backups', 'exports', 'user-data', 'temp', 'app-data', 'local-app-data']) mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(workspace, 'src', 'allowed.txt'), 'baseline\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  runGit(workspace, ['init', '-b', 'main'])
  runGit(workspace, ['config', 'user.name', 'R2D E2E'])
  runGit(workspace, ['config', 'user.email', 'r2d-e2e@localhost.invalid'])
  runGit(workspace, ['add', '--all'])
  runGit(workspace, ['commit', '-m', 'baseline'])

  const repoRoot = resolve(process.cwd())
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  app = await electron.launch({
    executablePath: join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: ['.', `--user-data-dir=${join(root, 'user-data')}`], cwd: repoRoot,
    env: {
      AGENT_WORKBENCH_E2E: '1', AGENT_WORKBENCH_FIXTURE_ROOT: root,
      AGENT_WORKBENCH_E2E_GIT_EXECUTABLE: git,
      AGENT_WORKBENCH_NODE_EXECUTABLE: process.execPath,
      AGENT_WORKBENCH_E2E_EXPORT_DIR: exportDir,
      USERPROFILE: root, APPDATA: join(root, 'app-data'), LOCALAPPDATA: join(root, 'local-app-data'),
      TEMP: join(root, 'temp'), TMP: join(root, 'temp'), SystemRoot: systemRoot, WINDIR: systemRoot,
      ComSpec: process.env.ComSpec ?? join(systemRoot, 'System32', 'cmd.exe'), PATH: `${join(systemRoot, 'System32')};${systemRoot}`
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // 0.1.2 shell: the default workspace view is the Project Desk. Enter the
  // Verification view so the VerificationWorkbench (只读验收) is reachable.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '验证' }).click()
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
})

test.afterEach(async () => {
  if (app) await app.close().catch(() => undefined)
  app = undefined
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

test('R2D: passing test produces a verifiable JSON Receipt and Markdown Handoff', async () => {
  writeFileSync(join(workspace, 'test', 'example.test.mjs'), PASSING_TEST, 'utf8')
  await runToResult('test/example.test.mjs')
  await expect(resultRegion().getByText('已验证').first()).toBeVisible()

  // Export both JSON and Markdown.
  await resultRegion().getByRole('button', { name: '导出两者' }).click()
  await expect(page.getByText('导出成功。')).toBeVisible()

  const jsonPath = join(exportDir, 'verification-receipt.json')
  const mdPath = join(exportDir, 'verification-handoff.md')
  expect(existsSync(jsonPath)).toBe(true)
  expect(existsSync(mdPath)).toBe(true)

  // Read and validate JSON receipt.
  const receipt = JSON.parse(readFileSync(jsonPath, 'utf8'))
  expect(receipt.schemaVersion).toBe('aw-verification-receipt-v1')
  expect(receipt.overallVerdict).toBe('VERIFIED')
  expect(receipt.acceptanceDecision).toBe('NOT_RECORDED')
  expect(typeof receipt.receiptDigest).toBe('string')
  expect(receipt.receiptDigest).toMatch(/^[0-9a-f]{64}$/)
  expect(receipt.subject.subjectDigest).toMatch(/^[0-9a-f]{64}$/)
  expect(receipt.policy.policyDigest).toMatch(/^[0-9a-f]{64}$/)
  // No absolute paths or node.exe path.
  const jsonRendered = JSON.stringify(receipt)
  expect(jsonRendered.includes(workspace)).toBe(false)
  expect(jsonRendered.includes(root)).toBe(false)
  expect(jsonRendered.includes('node.exe')).toBe(false)

  // Validate Markdown handoff.
  const markdown = readFileSync(mdPath, 'utf8')
  expect(markdown).toContain('# Agent Workbench Verification Handoff')
  expect(markdown).toContain('Overall Verification Verdict: VERIFIED')
  expect(markdown).toContain('Acceptance Decision: NOT_RECORDED')
  expect(markdown).toContain('PROCESS_BOUNDARY_ONLY')
  expect(markdown).toContain('NO_FILESYSTEM_SANDBOX')
  expect(markdown).toContain('NETWORK_NOT_ENFORCED')
  expect(markdown).toContain(receipt.receiptDigest)
  // Markdown must not contain the workspace absolute path.
  expect(markdown.includes(workspace)).toBe(false)
  // JSON and Markdown overall verdicts agree.
  expect(markdown).toContain(`Overall Verification Verdict: ${receipt.overallVerdict}`)
})

test('R2D: a failing test still exports a non-VERIFIED Receipt', async () => {
  writeFileSync(join(workspace, 'test', 'failing.test.mjs'), FAILING_TEST, 'utf8')
  await runToResult('test/failing.test.mjs')
  await expect(resultRegion().getByText('验收失败').first()).toBeVisible()

  await resultRegion().getByRole('button', { name: '导出 JSON Receipt' }).click()
  await expect(page.getByText('导出成功。')).toBeVisible()

  const jsonPath = join(exportDir, 'verification-receipt.json')
  expect(existsSync(jsonPath)).toBe(true)
  const receipt = JSON.parse(readFileSync(jsonPath, 'utf8'))
  expect(receipt.schemaVersion).toBe('aw-verification-receipt-v1')
  expect(receipt.overallVerdict).toBe('FAILED')
  expect(receipt.acceptanceDecision).toBe('NOT_RECORDED')
  expect(receipt.criterionResults[0].verdict).toBe('FAILED')
  expect(receipt.verification.exitCode).not.toBe(0)
  expect(receipt.receiptDigest).toMatch(/^[0-9a-f]{64}$/)
})
