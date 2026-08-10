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

const PASSING = "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('ok', () => assert.equal(1+1,2))\n"
const HANGING = "import test from 'node:test'\ntest('hang', async () => { await new Promise(r => setTimeout(r, 25000)) })\n"

function findGit(): string { const r = resolveWhereGitExecutable(); if (!r) throw new Error('git'); return r }

function resultRegion() { return page.getByRole('region', { name: '验证结果工作面' }) }
function inspector() { return page.getByRole('complementary', { name: '详情' }) }

async function fillContract(testFile: string): Promise<void> {
  const v = page.getByRole('region', { name: '只读验收' })
  await v.getByLabel('任务标题').fill('Selection E2E')
  await v.getByLabel('目标').fill('t')
  await v.getByLabel('允许路径').fill('src\ntest')
  await v.getByLabel('禁止路径').fill('.git')
  await v.getByRole('group', { name: '验收标准' }).getByLabel('验收标准 1').fill('t')
  await v.getByRole('group', { name: '已知风险' }).getByLabel('已知风险 1').fill('t')
  await v.getByLabel('验证方法').fill(testFile)
}

async function toResult(testFile: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '验证' }).click()
  await page.getByRole('heading', { name: '只读验收' }).waitFor({ timeout: 15000 })
  await fillContract(testFile)
  await page.getByRole('button', { name: '确认并继续' }).click()
  await page.getByRole('region', { name: '执行预览' }).getByText('固定命令', { exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: '一次确认并执行' }).click()
  await resultRegion().waitFor({ timeout: 60000 })
}

test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aw-sel-'))
  git = findGit()
  const ws = join(root, 'workspace')
  for (const d of ['src', 'test', 'docs', '.claude', 'memory', 'skills', 'projects', 'config']) mkdirSync(join(ws, d), { recursive: true })
  for (const d of ['settings', 'project', 'backups', 'exports', 'user-data', 'temp', 'app-data', 'local-app-data']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(ws, 'src', 'allowed.txt'), 'b\n', 'utf8')
  writeFileSync(join(ws, 'test', 'passing.test.mjs'), PASSING, 'utf8')
  writeFileSync(join(ws, 'test', 'hanging.test.mjs'), HANGING, 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  for (const a of [['init', '-b', 'main'], ['config', 'user.name', 'Sel'], ['config', 'user.email', 'sel@localhost.invalid'], ['add', '--all'], ['commit', '-m', 'b']]) execFileSync(git, a, { cwd: ws, stdio: 'pipe', windowsHide: true })
  writeFileSync(join(ws, 'src', 'allowed.txt'), 'c\n', 'utf8')

  const repoRoot = resolve(process.cwd())
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  app = await electron.launch({
    executablePath: join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: ['.', `--user-data-dir=${join(root, 'user-data')}`], cwd: repoRoot,
    env: {
      AGENT_WORKBENCH_E2E: '1', AGENT_WORKBENCH_FIXTURE_ROOT: root,
      AGENT_WORKBENCH_E2E_GIT_EXECUTABLE: git, AGENT_WORKBENCH_NODE_EXECUTABLE: process.execPath,
      AGENT_WORKBENCH_E2E_EXPORT_DIR: join(root, 'exports'),
      USERPROFILE: root, APPDATA: join(root, 'app-data'), LOCALAPPDATA: join(root, 'local-app-data'),
      TEMP: join(root, 'temp'), TMP: join(root, 'temp'), SystemRoot: systemRoot, WINDIR: systemRoot,
      ComSpec: process.env.ComSpec ?? join(systemRoot, 'System32', 'cmd.exe'), PATH: `${join(systemRoot, 'System32')};${systemRoot}`
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterEach(async () => {
  if (app) await app.close().catch(() => undefined)
  app = undefined
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

async function criterionRows() {
  return resultRegion().getByRole('region', { name: '条件台账' }).locator('tbody tr')
}
async function evidenceRows() {
  return resultRegion().getByRole('region', { name: '证据台账' }).locator('tbody tr')
}

test('selecting a Criterion row updates the Inspector to that Criterion and its evidence', async () => {
  await toResult('test/passing.test.mjs')
  const rows = await criterionRows()
  await expect(rows.first()).toBeVisible()
  const critId = (await rows.first().innerText()).split('\n')[0].trim()

  // Inspector before: default verdict/next-action context.
  const before = await inspector().innerText()
  await rows.first().click()
  const after = await inspector().innerText()
  expect(after).toContain(critId)
  expect(after).not.toBe(before)
  // The Inspector must explain how evidence affects this Criterion.
  expect(after).toMatch(/证据|Evidence|有效|参与判定/i)

  // aria-selected follows the real selection state.
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true')

  // Selecting the Evidence row switches the Inspector to the Evidence.
  const erows = await evidenceRows()
  await expect(erows.first()).toBeVisible()
  // The evidence id is the first token of the row (the row text joins all cells).
  const evId = (await erows.first().innerText()).trim().split(/\s+/)[0]
  await erows.first().click()
  const evAfter = await inspector().innerText()
  expect(evAfter).toContain(evId)
  await expect(erows.first()).toHaveAttribute('aria-selected', 'true')
  // Criterion row loses selection when Evidence is selected.
  await expect(rows.first()).toHaveAttribute('aria-selected', 'false')
})

test('keyboard selection works via Enter and Space', async () => {
  await toResult('test/passing.test.mjs')
  const rows = await criterionRows()
  await expect(rows.first()).toBeVisible()
  const critId = (await rows.first().innerText()).split('\n')[0].trim()

  await rows.first().focus()
  await page.keyboard.press('Enter')
  await expect(inspector()).toContainText(critId)
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true')

  // Space toggles off (deselect) then on.
  await rows.first().focus()
  await page.keyboard.press('Space')
  await expect(rows.first()).toHaveAttribute('aria-selected', 'false')
  await page.keyboard.press('Space')
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true')
})

test('a criterion with insufficient evidence shows a truthful INSUFFICIENT state in the Inspector', async () => {
  // Cancel a hanging run -> CANCELLED -> the Criterion verdict is honestly
  // INSUFFICIENT_EVIDENCE, never a fabricated VERIFIED.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '验证' }).click()
  await page.getByRole('heading', { name: '只读验收' }).waitFor({ timeout: 15000 })
  await fillContract('test/hanging.test.mjs')
  await page.getByRole('button', { name: '确认并继续' }).click()
  await page.getByRole('region', { name: '执行预览' }).getByText('固定命令', { exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: '一次确认并执行' }).click()
  await page.getByRole('heading', { name: '正在执行受控验证' }).waitFor({ timeout: 8000 })
  // Wait until the child has actually spawned (已用时 >= 3s) so cancel targets
  // the ACTIVE execution, not the pre-spawn pending confirmation.
  await expect.poll(async () => {
    const text = await page.getByRole('region', { name: '只读验收' }).innerText()
    const m = text.match(/已用时：(\d+)s/)
    return m ? Number(m[1]) : 0
  }, { timeout: 10000 }).toBeGreaterThanOrEqual(3)
  await page.getByRole('button', { name: '取消执行' }).click()
  await resultRegion().waitFor({ timeout: 60000 })

  const rows = await criterionRows()
  await expect(rows.first()).toBeVisible()
  // The verdict is honestly INSUFFICIENT_EVIDENCE — not a fabricated VERIFIED.
  const rowText = await rows.first().innerText()
  expect(rowText).toContain('证据不足')

  // Selecting the Criterion shows an honest explanation (no fake evidence).
  await rows.first().click()
  const insp = await inspector().innerText()
  expect(insp).toContain('证据不足')
  expect(insp).not.toContain('已验证')
})
