// Verification Contract path list editor: keyboard Enter/Space, multiline paste,
// zh/en switch, return-to-edit, and submit-boundary normalization.
// Regression guard for HUMAN-MAJOR-03 (PATH_LIST_EDITOR_INPUT_BROKEN).
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

function findGit(): string {
  const resolved = resolveWhereGitExecutable()
  if (!resolved) throw new Error('E2E requires a trusted git.exe')
  return resolved
}
function runGit(cwd: string, args: string[]): void {
  execFileSync(git, args, { cwd, stdio: 'pipe', windowsHide: true })
}

test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aw-path-editor-'))
  git = findGit()
  workspace = join(root, 'workspace')
  for (const dir of ['src', 'test', 'docs', '.claude']) mkdirSync(join(workspace, dir), { recursive: true })
  for (const dir of ['settings', 'project', 'backups', 'exports', 'user-data', 'temp', 'app-data', 'local-app-data']) mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(workspace, 'src', 'allowed.txt'), 'baseline\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  runGit(workspace, ['init', '-b', 'main'])
  runGit(workspace, ['config', 'user.name', 'Path Editor E2E'])
  runGit(workspace, ['config', 'user.email', 'path-editor-e2e@localhost.invalid'])
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
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '验证' }).click()
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
})

test.afterEach(async () => {
  if (app) await app.close().catch(() => undefined)
  app = undefined
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

async function fillRestOfContract(method = 'test/example.test.mjs'): Promise<void> {
  const verification = page.getByRole('region', { name: '定义验证合同' })
  await verification.getByLabel('任务标题').fill('Path editor E2E')
  await verification.getByLabel('目标').fill('键盘 Enter/空格、粘贴、提交归一化')
  await verification.getByRole('group', { name: '验收标准' }).getByLabel('验收标准 1').fill('passes')
  await verification.getByRole('group', { name: '已知风险' }).getByLabel('已知风险 1').fill('fixture only')
  await verification.getByLabel('验证方法').fill(method)
}

test('PATH: keyboard Enter creates separate lines in allowed paths', async () => {
  const allowed = page.getByLabel('允许路径')
  await allowed.fill('src')
  await allowed.press('Enter')
  await allowed.type('test')
  await page.waitForTimeout(200)
  expect(await allowed.inputValue()).toBe('src\ntest')
})

test('PATH: Shift+Enter also inserts a newline without anomaly', async () => {
  const allowed = page.getByLabel('允许路径')
  await allowed.fill('src')
  await allowed.press('Shift+Enter')
  await allowed.type('test')
  await page.waitForTimeout(200)
  expect(await allowed.inputValue()).toBe('src\ntest')
})

test('PATH: keyboard Space is preserved inside an allowed path', async () => {
  const allowed = page.getByLabel('允许路径')
  await allowed.fill('docs/release')
  await allowed.press(' ')
  await allowed.type('notes')
  await page.waitForTimeout(200)
  expect(await allowed.inputValue()).toBe('docs/release notes')
})

test('PATH: forbidden paths accept Enter-separated lines and space paths', async () => {
  const forbidden = page.getByLabel('禁止路径')
  await forbidden.fill('.git')
  await forbidden.press('Enter')
  await forbidden.type('node_modules')
  await forbidden.press('Enter')
  await forbidden.type('generated files')
  await page.waitForTimeout(200)
  expect(await forbidden.inputValue()).toBe('.git\nnode_modules\ngenerated files')
})

test('PATH: multiline paste with internal spaces is preserved', async () => {
  const allowed = page.getByLabel('允许路径')
  await allowed.fill('src\ntest\ndocs/release notes')
  await page.waitForTimeout(200)
  expect(await allowed.inputValue()).toBe('src\ntest\ndocs/release notes')
})

test('PATH: zh/en switch preserves entered content', async () => {
  const allowed = page.getByLabel('允许路径')
  await allowed.fill('src\ntest\ndocs/release notes')
  await page.getByRole('button', { name: '中 / EN' }).click()
  await page.waitForTimeout(200)
  // After switching to English the aria-label is "Allowed paths"; match both.
  const afterSwitch = await page.getByLabel(/允许路径|Allowed paths/).inputValue()
  expect(afterSwitch).toBe('src\ntest\ndocs/release notes')
})

test('PATH: continue normalizes to separate entries and preview succeeds', async () => {
  const allowed = page.getByLabel('允许路径')
  const forbidden = page.getByLabel('禁止路径')
  // Trailing spaces + a blank line must be trimmed/dropped at the submit boundary.
  await allowed.fill('src \ntest\n\ndocs/release notes')
  await forbidden.fill('.git\nnode_modules')
  await fillRestOfContract()
  await page.getByRole('button', { name: '确认并继续' }).click()
  const review = page.getByRole('region', { name: '执行预览' })
  await expect(review.getByText('固定命令', { exact: true })).toBeVisible()
  expect(await review.innerText()).toContain('node --test test/example.test.mjs')
})

test('PATH: return-to-edit restores the committed (normalized) paths', async () => {
  const allowed = page.getByLabel('允许路径')
  await allowed.fill('src\ntest\ndocs/release notes')
  await page.getByLabel('禁止路径').fill('.git')
  await fillRestOfContract()
  await page.getByRole('button', { name: '确认并继续' }).click()
  await expect(page.getByRole('region', { name: '执行预览' }).getByText('固定命令', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回编辑合同' }).click()
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  const restored = await page.getByLabel('允许路径').inputValue()
  expect(restored).toBe('src\ntest\ndocs/release notes')
})
