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

function cvRegion() {
  return page.getByRole('region', { name: '受控验证执行' })
}

async function fillContract(): Promise<void> {
  const verification = page.getByRole('region', { name: '只读验收' })
  await verification.getByLabel('任务标题').fill('受控验证 E2E')
  await verification.getByLabel('目标').fill('用固定 node --test 命令确认测试通过。')
  await verification.getByLabel('允许路径').fill('src\ntest')
  await verification.getByLabel('禁止路径').fill('.git')
  await verification.getByLabel('验收标准').fill('测试通过')
  await verification.getByLabel('已知风险').fill('仅运行固定测试命令')
}

async function generatePreview(): Promise<void> {
  await page.getByLabel('测试文件相对路径').fill('test/example.test.mjs')
  await page.getByRole('button', { name: '生成验证预览' }).click()
  const region = cvRegion()
  await expect(region.getByText('固定命令')).toBeVisible()
  await expect(region.getByText('node --test test/example.test.mjs')).toBeVisible()
  await expect(region.getByText('30s', { exact: true })).toBeVisible()
  await expect(region.getByText('PROCESS_BOUNDARY_ONLY')).toBeVisible()
  await expect(region.getByText('ALLOWLISTED_ENVIRONMENT')).toBeVisible()
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

test('controlled verification preview and one-time confirm run a passing test and verify', async ({}, testInfo) => {
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await fillContract()

  // Step 1: inspect current changes
  await page.getByRole('button', { name: '检查当前修改' }).click()
  await expect(page.getByText('范围检查：合规')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(root)

  // Step 2-4: generate and review the immutable preview
  await generatePreview()

  // Step 5-6: confirm once and execute
  const region = cvRegion()
  await page.getByRole('button', { name: '一次确认并执行' }).click()
  await expect(region.getByText('已验证')).toBeVisible()
  await expect(region.getByText('通过', { exact: true })).toBeVisible()
  await expect(region.getByText('Subject 前后一致')).toBeVisible()
  await expect(region.getByText('证据有效')).toBeVisible()
  await expect(region.getByText('证据新鲜')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(root)
  await page.screenshot({ path: testInfo.outputPath('controlled-verification-pass.png'), fullPage: true })
})

test('a failing test maps to FAIL and FAILED acceptance verdict', async ({}) => {
  writeFileSync(join(workspace, 'test', 'failing.test.mjs'), FAILING_TEST, 'utf8')
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await fillContract()

  await page.getByLabel('测试文件相对路径').fill('test/failing.test.mjs')
  await page.getByRole('button', { name: '生成验证预览' }).click()
  await expect(cvRegion().getByText('node --test test/failing.test.mjs')).toBeVisible()

  await page.getByRole('button', { name: '一次确认并执行' }).click()
  await expect(cvRegion().getByText('验收失败')).toBeVisible()
  await expect(cvRegion().getByText('失败', { exact: true })).toBeVisible()
})

test('a code change after preview makes the confirmation stale', async ({}) => {
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await fillContract()
  await generatePreview()

  // Code changes after preview -> confirmation must be rejected as stale
  writeFileSync(join(workspace, 'src', 'late-change.txt'), 'late\n', 'utf8')

  await page.getByRole('button', { name: '一次确认并执行' }).click()
  await expect(cvRegion().getByText('已拒绝')).toBeVisible()
  await expect(cvRegion().getByText('代码或工作区已变化，确认失效，请重新生成预览。')).toBeVisible()
})
