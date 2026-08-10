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

// F5: 在主进程挂 ipcMain 记录器，监听 session/terminal/action 通道。
// contextBridge 暴露的 window.api 为只读，无法在 renderer 侧 stub；改为主进程侧监控真实 IPC 到达。
async function installIpcRecorder(): Promise<void> {
  if (!app) throw new Error('app not launched')
  const installed = await app.evaluate(async ({ ipcMain }) => {
    if ((globalThis as any).__awIpcRecorderInstalled) return true
    const recorded: string[] = []
    const channels = [
      'session:readiness', 'session:prepare', 'session:start', 'session:input', 'session:stop',
      'session:get-status', 'session:get-receipt',
      'terminal:start', 'terminal:stop', 'terminal:write', 'terminal:resize',
      'action:propose', 'action:approve', 'action:reject', 'action:cancel', 'action:execute', 'action:get-receipts'
    ]
    for (const ch of channels) {
      ipcMain.on(ch, () => { recorded.push(ch) })
    }
    ;(globalThis as any).__awIpcRecorded = recorded
    ;(globalThis as any).__awIpcRecorderInstalled = true
    return true
  })
  if (!installed) throw new Error('F5 IPC recorder could not be installed')
}

async function clearIpcRecorder(): Promise<void> {
  if (!app) return
  await app.evaluate(() => { (globalThis as any).__awIpcRecorded.length = 0 })
}

async function readIpcRecordings(): Promise<string[]> {
  if (!app) return []
  return app.evaluate(() => {
    if (!(globalThis as any).__awIpcRecorderInstalled) throw new Error('F5 IPC recorder not installed')
    return [...(globalThis as any).__awIpcRecorded]
  })
}

function findGit(): string {
  const resolved = resolveWhereGitExecutable()
  if (!resolved) throw new Error('E2E requires a trusted git.exe')
  return resolved
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
  await installIpcRecorder()
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

test('Welcome verification flow classifies allowed then outside-scope changes without Agent or raw path exposure', async ({}, testInfo) => {
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  const verification = page.getByRole('region', { name: '只读验收' })
  await verification.getByLabel('任务标题').fill('检查当前修改')
  await verification.getByLabel('目标').fill('确认改动范围，功能正确性留待后续验证。')
  await verification.getByLabel('允许路径').fill('src')
  await verification.getByLabel('禁止路径').fill('.git')
  await verification.getByLabel('验收标准').fill('所有改动路径都被分类')
  await verification.getByLabel('已知风险').fill('尚未运行验证命令')

  // F5: 清空启动期记录，再执行 verification 流程
  await clearIpcRecorder()

  await verification.getByRole('button', { name: '检查当前修改' }).click()
  await expect(verification.getByText('范围检查：合规')).toBeVisible()
  await expect(verification.getByText('还不能确认任务已经完成')).toBeVisible()
  await expect(verification.getByText('只检查 Git 修改范围；尚未运行功能验证命令。', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(root)

  // F4: 修改允许路径后旧结果立即消失
  await verification.getByLabel('允许路径').fill('docs')
  await expect(verification.getByText('范围检查：合规')).not.toBeVisible()
  // 恢复允许路径，保持后续流程语义不变
  await verification.getByLabel('允许路径').fill('src')

  const workspace = join(root, 'workspace')
  writeFileSync(join(workspace, 'docs', 'outside.txt'), 'outside change\n', 'utf8')
  await verification.getByRole('button', { name: '检查当前修改' }).click()
  await expect(verification.getByText('范围检查：发现范围外修改')).toBeVisible()
  await expect(verification.getByText('docs/outside.txt')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(root)

  // F5: verification 流程期间不得触发 Session/Terminal/Action IPC
  const recorded = await readIpcRecordings()
  expect(recorded.filter(ch => ch.startsWith('session:') || ch.startsWith('terminal:') || ch.startsWith('action:'))).toEqual([])

  await page.screenshot({ path: testInfo.outputPath('verification-result.png'), fullPage: true })
})

// 注：F3/F4 的其余场景（请求进行中修改 Contract 丢弃旧响应、workspace A/B 竞态、
// getStatus 失败清除旧结果、onChanged 可解除订阅）由单元测试
// `tests/unit/inspection-guard.test.mts` 覆盖。原因：contextBridge 暴露的 `window.api`
// 成员为只读（writable=false, configurable=false），E2E 无法 stub
// `api.verification.inspect` 或 `api.workspaceSelection.getStatus` 以构造可控时序；
// 因此这些状态判别逻辑被抽为纯函数模块并在单元测试中验证。
