import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let app: ElectronApplication | undefined
let page: Page
let root = ''
let git = ''

function findGit(): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  return execFileSync(join(systemRoot, 'System32', 'where.exe'), ['git.exe'], { encoding: 'utf8' }).split(/\r?\n/).find(Boolean)!.trim()
}

function runGit(cwd: string, args: string[]): void {
  execFileSync(git, args, { cwd, stdio: 'pipe', windowsHide: true })
}

test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aw-r2a1-electron-'))
  git = findGit()
  const workspace = join(root, 'workspace')
  for (const dir of ['src', 'docs', 'memory', 'skills', 'projects', '.claude']) mkdirSync(join(workspace, dir), { recursive: true })
  for (const dir of ['settings', 'project', 'backups', 'exports', 'user-data', 'temp', 'app-data', 'local-app-data']) mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(workspace, 'src', 'allowed.txt'), 'baseline\n', 'utf8')
  writeFileSync(join(workspace, 'docs', 'outside.txt'), 'baseline\n', 'utf8')
  writeFileSync(join(workspace, 'CLAUDE.md'), '# Fixture\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  runGit(workspace, ['init', '-b', 'main'])
  runGit(workspace, ['config', 'user.name', 'R2A1 E2E'])
  runGit(workspace, ['config', 'user.email', 'r2a1-e2e@localhost.invalid'])
  runGit(workspace, ['add', '--all'])
  runGit(workspace, ['commit', '-m', 'baseline'])
  writeFileSync(join(workspace, 'src', 'allowed.txt'), 'allowed change\n', 'utf8')

  const repoRoot = resolve(process.cwd())
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  app = await electron.launch({
    executablePath: join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: ['.', `--user-data-dir=${join(root, 'user-data')}`], cwd: repoRoot,
    env: {
      AGENT_WORKBENCH_E2E: '1', AGENT_WORKBENCH_FIXTURE_ROOT: root,
      AGENT_WORKBENCH_E2E_GIT_EXECUTABLE: git,
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

test('Welcome verification flow classifies allowed then outside-scope changes without Agent or raw path exposure', async ({}, testInfo) => {
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  const verification = page.getByRole('region', { name: '只读验收' })
  await verification.getByLabel('任务标题').fill('检查当前修改')
  await verification.getByLabel('目标').fill('确认改动范围，功能正确性留待后续验证。')
  await verification.getByLabel('允许路径').fill('src')
  await verification.getByLabel('禁止路径').fill('.git')
  await verification.getByLabel('验收标准').fill('所有改动路径都被分类')
  await verification.getByLabel('已知风险').fill('尚未运行验证命令')

  await page.evaluate(() => {
    const api = (window as any).api
    for (const name of ['prepare', 'start', 'input', 'stop']) {
      api.session[name] = () => Promise.reject(new Error(`verification must not call session.${name}`))
    }
  })

  await verification.getByRole('button', { name: '检查当前修改' }).click()
  await expect(verification.getByText('范围检查：合规')).toBeVisible()
  await expect(verification.getByText('还不能确认任务已经完成')).toBeVisible()
  await expect(verification.getByText('只检查 Git 修改范围；尚未运行功能验证命令。', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(root)

  const workspace = join(root, 'workspace')
  writeFileSync(join(workspace, 'docs', 'outside.txt'), 'outside change\n', 'utf8')
  await verification.getByRole('button', { name: '检查当前修改' }).click()
  await expect(verification.getByText('范围检查：发现范围外修改')).toBeVisible()
  await expect(verification.getByText('docs/outside.txt')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(root)
  await page.screenshot({ path: testInfo.outputPath('verification-result.png'), fullPage: true })
})
