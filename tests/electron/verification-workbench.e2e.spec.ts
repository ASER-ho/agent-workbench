// 0.1.2-B Verification Workbench — targeted production-worksurface tests.
//
// Covers:
//   DEFINE — required fields, criteria collapse, path/method validation,
//            unsaved-state banner, discard protection, leave protection.
//   REVIEW — subject (scope inspection), recipe preview, honest "cannot
//            execute" when the test file is missing.
//   VERIFY — running state (no fake percentage), cancel → CANCELLED,
//            timeout → TIMEOUT, subject-changed + insufficient evidence.
//   No dual navigation, no Agent Claim / External Work / Acceptance copy.
//
// Security/semantic assertions (no path leak, no session/terminal/action IPC)
// are preserved in the sibling specs; this spec focuses on the work surface.

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

const SLOW_PASSING_TEST = [
  "import test from 'node:test'",
  "import assert from 'node:assert/strict'",
  "test('slow passes', async () => { await new Promise(r => setTimeout(r, 5000)); assert.equal(1 + 1, 2) })",
  ''
].join('\n')

const HANGING_TEST = [
  "import test from 'node:test'",
  "test('hangs forever', async () => { await new Promise(() => setInterval(() => {}, 1000)) })",
  ''
].join('\n')

const SUBJECT_CHANGE_TEST = [
  "import test from 'node:test'",
  "import assert from 'node:assert/strict'",
  "import fs from 'node:fs'",
  "test('writes during verification', () => { fs.writeFileSync('src/touch.txt', 'changed\\n'); assert.equal(1 + 1, 2) })",
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

function verifyRegion() {
  return page.getByRole('region', { name: '验证执行中' })
}

function resultRegion() {
  return page.getByRole('region', { name: '验证结果' })
}

async function fillContract(): Promise<void> {
  const verification = workbench()
  await verification.getByLabel('任务标题').fill('Workbench E2E')
  await verification.getByLabel('目标').fill('确认固定 node --test 行为。')
  await verification.getByLabel('允许路径').fill('src\ntest')
  await verification.getByLabel('禁止路径').fill('.git')
  await verification.getByRole('group', { name: '验收标准' }).getByLabel('验收标准 1').fill('测试通过')
  await verification.getByRole('group', { name: '已知风险' }).getByLabel('已知风险 1').fill('仅运行固定测试命令')
  await verification.getByLabel('验证方法').fill('test/example.test.mjs')
}

async function enterReview(): Promise<void> {
  await page.getByRole('button', { name: '确认并继续' }).click()
  await expect(reviewRegion().getByText('固定命令', { exact: true })).toBeVisible()
}

async function setupWorkspace(extraTestFile: { name: string; content: string } | null): Promise<void> {
  root = mkdtempSync(join(tmpdir(), 'aw-wb-electron-'))
  git = findGit()
  workspace = join(root, 'workspace')
  for (const dir of ['src', 'test', 'docs', '.claude']) mkdirSync(join(workspace, dir), { recursive: true })
  for (const dir of ['settings', 'project', 'backups', 'exports', 'user-data', 'temp', 'app-data', 'local-app-data']) mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(workspace, 'src', 'allowed.txt'), 'baseline\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  if (extraTestFile) writeFileSync(join(workspace, 'test', extraTestFile.name), extraTestFile.content, 'utf8')
  runGit(workspace, ['init', '-b', 'main'])
  runGit(workspace, ['config', 'user.name', 'WB E2E'])
  runGit(workspace, ['config', 'user.email', 'wb-e2e@localhost.invalid'])
  runGit(workspace, ['add', '--all'])
  runGit(workspace, ['commit', '-m', 'baseline'])
}

async function launch(): Promise<void> {
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
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '验证' }).click()
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
}

test.afterEach(async () => {
  if (app) await app.close().catch(() => undefined)
  app = undefined
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

test('DEFINE: required fields, criteria collapse, and path/method validation are surfaced', async () => {
  await setupWorkspace({ name: 'example.test.mjs', content: PASSING_TEST })
  await launch()

  const verification = workbench()
  // Fill only the title, then attempt to continue -> required-field errors appear.
  await verification.getByLabel('任务标题').fill('只填标题')
  await page.getByRole('button', { name: '确认并继续' }).click()
  await expect(verification.getByText('必填', { exact: true })).toBeVisible()
  // We are still in DEFINE (no navigation to REVIEW happened).
  await expect(reviewRegion()).toBeHidden()

  // Path validation: an absolute path is rejected live.
  await verification.getByLabel('允许路径').fill('C:\\Windows')
  await expect(verification.getByText(/路径必须为工作区相对路径/)).toBeVisible()
  await verification.getByLabel('允许路径').fill('src\ntest')

  // Method validation: a non-.js/.mjs/.cjs extension is rejected live.
  await verification.getByLabel('验证方法').fill('test/foo.py')
  await expect(verification.getByText(/测试文件扩展名必须为/)).toBeVisible()
  await verification.getByLabel('验证方法').fill('test/example.test.mjs')

  // Criteria 1-4 expanded by default; 5+ collapse behind a summary toggle.
  const criteria = verification.getByRole('group', { name: '验收标准' })
  for (let i = 0; i < 4; i += 1) {
    await criteria.getByRole('button', { name: '+ 添加一项' }).click()
  }
  // 5 total now: first 4 visible, 5th collapsed.
  await expect(criteria.getByLabel('验收标准 1')).toBeVisible()
  await expect(criteria.getByLabel('验收标准 4')).toBeVisible()
  await expect(criteria.getByLabel('验收标准 5')).toBeHidden()
  await expect(criteria.getByText('另有 1 条未展开')).toBeVisible()
  await criteria.getByRole('button', { name: '展开全部' }).click()
  await expect(criteria.getByLabel('验收标准 5')).toBeVisible()
})

test('DEFINE: unsaved state is surfaced, discard is protected, and draft survives navigation', async () => {
  await setupWorkspace({ name: 'example.test.mjs', content: PASSING_TEST })
  await launch()

  const verification = workbench()
  await verification.getByLabel('任务标题').fill('未保存的标题')

  // Unsaved edits are visible.
  await expect(verification.getByText('有未保存的编辑')).toBeVisible()

  // Discard protection: clicking 取消 opens a confirm; 继续编辑 keeps the edits.
  await page.getByRole('button', { name: '取消' }).click()
  const dialog = page.getByRole('alertdialog', { name: '放弃未保存的编辑' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '继续编辑' }).click()
  await expect(dialog).toBeHidden()
  await expect(verification.getByLabel('任务标题')).toHaveValue('未保存的标题')

  // Leave protection: navigating away and back preserves the draft (no silent loss).
  const rail = page.getByRole('navigation', { name: 'Primary' })
  await rail.getByRole('button', { name: '工作区' }).click()
  await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible()
  await rail.getByRole('button', { name: '验证' }).click()
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await expect(workbench().getByLabel('任务标题')).toHaveValue('未保存的标题')

  // Discard: 放弃更改 resets to the last confirmed (committed) state.
  await page.getByRole('button', { name: '取消' }).click()
  await page.getByRole('alertdialog', { name: '放弃未保存的编辑' }).getByRole('button', { name: '放弃更改' }).click()
  await expect(workbench().getByLabel('任务标题')).toHaveValue('')
  await expect(workbench().getByText('有未保存的编辑')).toBeHidden()
})

test('REVIEW: shows subject and recipe; a missing test file honestly reports it cannot execute', async () => {
  // No test file in the fixture.
  await setupWorkspace(null)
  await launch()

  await fillContract()
  await page.getByRole('button', { name: '确认并继续' }).click()

  const review = reviewRegion()
  // Subject / observation is real.
  await expect(review.getByText('范围检查：合规')).toBeVisible()
  // Because the test file does not exist, the preview fails and execution is
  // honestly blocked — the user sees why and the confirm action is disabled.
  await expect(review.getByText('无法生成执行预览：')).toBeVisible()
  await expect(review.getByText('当前无法执行')).toBeVisible()
  await expect(review.getByRole('button', { name: '一次确认并执行' })).toBeDisabled()
})

test('VERIFY: running state shows no fake percentage; cancel yields a real CANCELLED state', async () => {
  await setupWorkspace({ name: 'hanging.test.mjs', content: HANGING_TEST })
  await launch()

  await fillContract()
  await workbench().getByLabel('验证方法').fill('test/hanging.test.mjs')
  await enterReview()
  await page.getByRole('button', { name: '一次确认并执行' }).click()

  // Running state is indeterminate: no percentage, no dual-navigation stepper.
  await expect(verifyRegion().getByText('正在执行受控验证')).toBeVisible()
  const runningText = await verifyRegion().innerText()
  expect(runningText).not.toContain('%')
  expect(runningText).not.toMatch(/\d+\s*\/\s*\d+/)
  // No fake navigation steps in the running state.
  await expect(page.getByRole('button', { name: '取消执行' })).toBeVisible()

  // Wait until the child process has actually spawned (elapsed >= 3s) so cancel
  // targets the ACTIVE execution, not the pre-spawn pending confirmation.
  await expect.poll(async () => {
    const text = await verifyRegion().innerText()
    const match = text.match(/已用时：(\d+)s/)
    return match ? Number(match[1]) : 0
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(3)

  // Cancel -> real CANCELLED result state with what/why/next.
  await page.getByRole('button', { name: '取消执行' }).click()
  const result = resultRegion()
  // C's Result Workbench renders the real Insufficient-Evidence state with the
  // cancelled reason; the actionable next step is provided beside the result.
  await expect(result.getByText('证据不足').first()).toBeVisible()
  await expect(result.getByText(/执行被取消/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '重新生成预览并验证' })).toBeVisible()
})

test('VERIFY: a hanging test times out into a real TIMEOUT state', async () => {
  test.setTimeout(120_000)
  await setupWorkspace({ name: 'hanging.test.mjs', content: HANGING_TEST })
  await launch()

  await fillContract()
  await workbench().getByLabel('验证方法').fill('test/hanging.test.mjs')
  await enterReview()
  await page.getByRole('button', { name: '一次确认并执行' }).click()

  await expect(verifyRegion().getByText('正在执行受控验证')).toBeVisible()
  // The manager's fixed 30s timeout fires; no fake progress is shown meanwhile.
  const result = resultRegion()
  await expect(result.getByText(/测试命令超时/).first()).toBeVisible({ timeout: 45_000 })
  await expect(result.getByText('证据不足').first()).toBeVisible()
})

test('VERIFY: a test that mutates the subject yields Subject Changed + Insufficient Evidence', async () => {
  await setupWorkspace({ name: 'mutating.test.mjs', content: SUBJECT_CHANGE_TEST })
  await launch()

  await fillContract()
  await workbench().getByLabel('验证方法').fill('test/mutating.test.mjs')
  await enterReview()
  await page.getByRole('button', { name: '一次确认并执行' }).click()

  const result = resultRegion()
  await expect(result.getByText(/验证期间 Subject 已变化/).first()).toBeVisible()
  await expect(result.getByText('证据不足').first()).toBeVisible()
  // No path leak.
  await expect(page.locator('body')).not.toContainText(root)
})
