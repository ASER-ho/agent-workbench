import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { resolveWhereGitExecutable } from '../../src/main/services/git-verification'

let app: ElectronApplication | undefined
let page: Page
let root = ''
let git = ''
let workspace = ''

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

function reviewRegion() {
  return page.getByRole('region', { name: '执行预览' })
}

function resultRegion() {
  // 0.1.2-C Result Workbench region.
  return page.getByRole('region', { name: '验证结果工作面' })
}

async function fillContract(): Promise<void> {
  const verification = workbench()
  await verification.getByLabel('任务标题').fill('受控验证 E2E')
  await verification.getByLabel('目标').fill('用固定 node --test 命令确认测试通过。')
  await verification.getByLabel('允许路径').fill('src\ntest')
  await verification.getByLabel('禁止路径').fill('.git')
  await verification.getByRole('group', { name: '验收标准' }).getByLabel('验收标准 1').fill('测试通过')
  await verification.getByRole('group', { name: '已知风险' }).getByLabel('已知风险 1').fill('仅运行固定测试命令')
  await verification.getByLabel('验证方法').fill('test/example.test.mjs')
}

async function enterReview(): Promise<void> {
  await page.getByRole('button', { name: '确认并继续' }).click()
  const review = reviewRegion()
  await expect(review.getByText('固定命令', { exact: true })).toBeVisible()
  await expect(review.getByText('node --test test/example.test.mjs')).toBeVisible()
  await expect(review.getByText('30s', { exact: true })).toBeVisible()
  await expect(review.getByText('PROCESS_BOUNDARY_ONLY', { exact: true })).toBeVisible()
  await expect(review.getByText('ALLOWLISTED_ENVIRONMENT', { exact: true })).toBeVisible()
}

test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aw-cv-electron-'))
  git = findGit()
  workspace = join(root, 'workspace')
  for (const dir of ['src', 'test', 'docs', '.claude']) mkdirSync(join(workspace, dir), { recursive: true })
  for (const dir of ['settings', 'project', 'backups', 'exports', 'user-data', 'temp', 'app-data', 'local-app-data']) mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(workspace, 'src', 'allowed.txt'), 'baseline\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  runGit(workspace, ['init', '-b', 'main'])
  runGit(workspace, ['config', 'user.name', 'R2B2B E2E'])
  runGit(workspace, ['config', 'user.email', 'r2b2b-e2e@localhost.invalid'])
  runGit(workspace, ['add', '--all'])
  runGit(workspace, ['commit', '-m', 'baseline'])
  writeFileSync(join(workspace, 'test', 'example.test.mjs'), PASSING_TEST, 'utf8')

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

test('controlled verification preview and one-time confirm run a passing test and verify', async ({}, testInfo) => {
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await fillContract()

  // DEFINE -> REVIEW shows the scope inspection and the immutable execution preview.
  await enterReview()
  const review = reviewRegion()
  await expect(review.getByText('范围检查：合规')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(root)

  // VERIFY: confirm once and execute.
  await page.getByRole('button', { name: '一次确认并执行' }).click()

  // RESULT: real ControlledVerificationResult rendered by the 0.1.2-C Result
  // Workbench. Assert C's actual texts: verdict label, evidence ledger status,
  // subject stability, evidence freshness/validity.
  const result = resultRegion()
  await expect(result.getByText('已验证').first()).toBeVisible()
  await expect(result.getByText('通过', { exact: true })).toBeVisible()
  await expect(result.getByText('Subject 前后一致').first()).toBeVisible()
  await expect(result.getByText('有效', { exact: true }).first()).toBeVisible()
  await expect(result.getByText('新鲜', { exact: true }).first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText(root)
  await page.screenshot({ path: testInfo.outputPath('controlled-verification-pass.png'), fullPage: true })
})

test('a failing test maps to FAIL and FAILED acceptance verdict', async () => {
  writeFileSync(join(workspace, 'test', 'failing.test.mjs'), FAILING_TEST, 'utf8')
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await fillContract()
  await workbench().getByLabel('验证方法').fill('test/failing.test.mjs')

  await page.getByRole('button', { name: '确认并继续' }).click()
  await expect(reviewRegion().getByText('node --test test/failing.test.mjs')).toBeVisible()

  await page.getByRole('button', { name: '一次确认并执行' }).click()
  await expect(resultRegion().getByText('验收失败').first()).toBeVisible()
  await expect(resultRegion().getByText('失败', { exact: true })).toBeVisible()
})

test('a code change after preview makes the confirmation stale', async () => {
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await fillContract()
  await enterReview()

  // Code changes after preview -> confirmation must be rejected as stale
  writeFileSync(join(workspace, 'src', 'late-change.txt'), 'late\n', 'utf8')

  await page.getByRole('button', { name: '一次确认并执行' }).click()
  await expect(resultRegion().getByText('确认被拒绝')).toBeVisible()
  await expect(resultRegion().getByText(/代码或工作区已变化/).first()).toBeVisible()
})
