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

function findGit(): string {
  const resolved = resolveWhereGitExecutable()
  if (!resolved) throw new Error('E2E requires a trusted git.exe')
  return resolved
}

function runGit(cwd: string, args: string[]): void {
  execFileSync(git, args, { cwd, stdio: 'pipe', windowsHide: true })
}

test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'aw-shell-electron-'))
  git = findGit()
  workspace = join(root, 'workspace')
  const exportDir = join(root, 'exports')
  for (const dir of ['src', 'test', 'docs', '.claude', 'memory', 'skills', 'projects', 'config']) mkdirSync(join(workspace, dir), { recursive: true })
  for (const dir of ['settings', 'project', 'backups', 'exports', 'user-data', 'temp', 'app-data', 'local-app-data']) mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(workspace, 'src', 'allowed.txt'), 'baseline\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  runGit(workspace, ['init', '-b', 'main'])
  runGit(workspace, ['config', 'user.name', 'Shell E2E'])
  runGit(workspace, ['config', 'user.email', 'shell-e2e@localhost.invalid'])
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
})

test.afterEach(async () => {
  if (app) await app.close().catch(() => undefined)
  app = undefined
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

test('0.1.2-A shell chrome renders: rail, topbar brand, inspector, statusbar', async () => {
  // Left rail navigation with the four primary views.
  const rail = page.getByRole('navigation', { name: 'Primary' })
  await expect(rail).toBeVisible()
  for (const label of ['工作区', '验证', '环境', '设置']) {
    await expect(rail.getByRole('button', { name: label })).toBeVisible()
  }

  // TopBar brand block: "AW" mark + "Agent Workbench" wordmark.
  const topBar = page.locator('header').filter({ hasText: 'Agent Workbench' })
  await expect(topBar).toBeVisible()
  await expect(topBar.getByText('AW', { exact: true })).toBeVisible()
  await expect(topBar.getByText('Agent Workbench')).toBeVisible()

  // Inspector (right panel) is visible by default with the localized title.
  await expect(page.getByRole('complementary', { name: '详情' })).toBeVisible()

  // StatusBar is present at the bottom.
  await expect(page.locator('.status-bar')).toBeVisible()
})

test('rail navigates between workspace / verification / environment / settings views', async () => {
  const rail = page.getByRole('navigation', { name: 'Primary' })

  // Default view is the Project Desk (workspace home).
  await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '项目文件' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建验证' })).toBeVisible()

  // Verification view shows the VerificationWorkbench.
  await rail.getByRole('button', { name: '验证' }).click()
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()

  // Environment view shows readiness + diagnostics.
  await rail.getByRole('button', { name: '环境' }).click()
  await expect(page.getByRole('heading', { name: '环境就绪检查' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeHidden()

  // Settings view shows the product-aligned settings (Appearance default).
  await rail.getByRole('button', { name: '设置' }).click()
  await expect(page.getByRole('heading', { name: '个性化' })).toBeVisible()

  // Back to the Project Desk.
  await rail.getByRole('button', { name: '工作区' }).click()
  await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible()
})

test('workspace shows the Project Desk; Project Files opens the file browser on demand', async () => {
  // Default workspace view = Project Desk, NOT a permanent legacy sidebar:
  // the file browser sections are not visible until Project Files is opened.
  await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible()
  await expect(page.getByText('记忆').first()).toBeHidden()

  // Open the Project Files drawer -> the file browser entry points appear.
  await page.getByRole('button', { name: '项目文件' }).click()
  await expect(page.getByText('记忆').first()).toBeVisible()
  for (const label of ['技能', '项目', '配置']) {
    await expect(page.getByText(label).first()).toBeVisible()
  }
  await expect(page.getByTitle('收起侧边栏')).toBeVisible()

  // Escape closes the drawer -> the browser is hidden again (no permanent sidebar).
  await page.keyboard.press('Escape')
  await expect(page.getByText('记忆').first()).toBeHidden()
})

test('inspector toggles closed and open from the topbar', async () => {
  const inspector = page.getByRole('complementary', { name: '详情' })
  await expect(inspector).toBeVisible()

  const toggle = page.getByTitle('显示详情')
  await toggle.click()
  await expect(inspector).toBeHidden()

  await toggle.click()
  await expect(inspector).toBeVisible()
})

test('command palette opens with Ctrl+K, runs a command, and closes with Escape', async () => {
  // Wait for the shell to mount so the global Ctrl+K/Ctrl+B keydown handler is registered.
  await expect(page.getByRole('button', { name: '工作区' })).toBeVisible()

  // Ctrl+K opens the palette with a focused search input.
  await page.keyboard.press('Control+K')
  const searchInput = page.getByPlaceholder('搜索命令…')
  await expect(searchInput).toBeVisible()

  // Type a filter and run the Verification command via Enter.
  await searchInput.fill('验证')
  await expect(page.getByText('前往验证')).toBeVisible()
  await page.keyboard.press('Enter')

  // Palette navigated to the Verification view and closed itself.
  await expect(page.getByRole('heading', { name: '只读验收' })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()

  // Ctrl+K reopens, Escape closes.
  await page.keyboard.press('Control+K')
  await expect(page.getByPlaceholder('搜索命令…')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('theme defaults to light on first launch and toggles light -> dark -> light', async () => {
  const readTheme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))

  // First launch with a fresh user-data-dir (no persisted preference) boots Light.
  await expect.poll(readTheme).toBe('light')
  await page.getByTitle('切换主题').click()
  await expect.poll(readTheme).toBe('dark')
  await page.getByTitle('切换主题').click()
  await expect.poll(readTheme).toBe('light')
})

test('a persisted dark theme preference is honored and overrides the light default', async () => {
  const readTheme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))

  // Default is light on first launch.
  await expect.poll(readTheme).toBe('light')

  // Switch to dark, persist the preference, then reload.
  await page.getByTitle('切换主题').click()
  await expect.poll(readTheme).toBe('dark')
  await page.evaluate(() => localStorage.setItem('agent-workbench-theme', 'dark'))
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // The persisted preference wins over the light default.
  await expect.poll(readTheme).toBe('dark')
})

test('language toggle switches zh -> en -> zh', async () => {
  const rail = page.getByRole('navigation', { name: 'Primary' })

  // Initial locale is zh.
  await expect(rail.getByRole('button', { name: '工作区' })).toBeVisible()
  await expect(page.getByTitle('English')).toBeVisible()

  // Switch to English: topbar toggle shows "EN / ZH", rail shows English labels.
  await page.getByTitle('English').click()
  await expect(rail.getByRole('button', { name: 'Workspace' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'EN / ZH' })).toBeVisible()

  // Switch back to zh.
  await page.getByRole('button', { name: 'EN / ZH' }).click()
  await expect(rail.getByRole('button', { name: '工作区' })).toBeVisible()
})

test('status bar shows a ticking local time and a monotonic session timer', async () => {
  const statusBar = page.locator('.status-bar')
  const localTime = statusBar.locator('span', { hasText: /本机时间/ })
  const session = statusBar.locator('span', { hasText: /使用时长/ })
  await expect(localTime).toBeVisible()
  await expect(session).toBeVisible()

  const parseSessionSeconds = (text: string): number => {
    const match = text.match(/(\d{2}):(\d{2}):(\d{2})/)
    if (!match) throw new Error(`unparseable session text: ${text}`)
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  }

  const beforeLocal = await localTime.innerText()
  const beforeSession = parseSessionSeconds(await session.innerText())

  await page.waitForTimeout(2100)

  const afterLocal = await localTime.innerText()
  const afterSession = parseSessionSeconds(await session.innerText())

  // Local time (to the second) must have advanced.
  expect(afterLocal).not.toBe(beforeLocal)
  // Session counter is monotonic non-decreasing and has actually increased.
  expect(afterSession).toBeGreaterThanOrEqual(beforeSession)
  expect(afterSession).toBeGreaterThan(beforeSession)
})

test('Ctrl+B collapses and expands the rail', async () => {
  const rail = page.getByRole('navigation', { name: 'Primary' })
  const railWidth = async (): Promise<number> => (await rail.boundingBox())?.width ?? 0

  // Expanded by default (~208px), collapses to the icon rail (~52px).
  await expect.poll(railWidth).toBeGreaterThan(100)
  await page.keyboard.press('Control+B')
  await expect.poll(railWidth).toBeLessThan(80)
  await page.keyboard.press('Control+B')
  await expect.poll(railWidth).toBeGreaterThan(100)
})

test('shell does not render planned/legacy fake-backend nav or buttons', async () => {
  // Wait for the shell to settle first.
  await expect(page.getByRole('button', { name: '工作区' })).toBeVisible()

  const bodyText = await page.locator('body').innerText()
  for (const pattern of [/\bAccept\b/, /\bReject\b/, /\bNeeds Work\b/, /\bAgent Claim\b/, /\bHistory\b/, /\bExternal Work\b/]) {
    expect(bodyText, `unexpected fake-backend copy: ${pattern}`).not.toMatch(pattern)
  }
})

test('cutover removes the legacy AI-session terminal and provider/agent settings surfaces', async () => {
  // No global AI-session terminal on the shell (default view = Project Desk).
  const body = await page.locator('body').innerText()
  for (const forbidden of ['AI 会话终端', 'Review & Launch', '检查并启动', 'Local Stub Agent Session', 'Stub Agent']) {
    expect(body, `unexpected legacy terminal copy: ${forbidden}`).not.toContain(forbidden)
  }

  // Settings hides the legacy API/Provider/Claude-config surfaces.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '设置' }).click()
  await expect(page.getByRole('heading', { name: '个性化' })).toBeVisible()
  const settingsBody = await page.locator('body').innerText()
  for (const forbidden of ['API Configuration', 'DeepSeek', 'OpenRouter', 'Provider Runtime', 'Test Connection', 'Claude Detection', '检测 Claude Code']) {
    expect(settingsBody, `unexpected legacy settings copy: ${forbidden}`).not.toContain(forbidden)
  }
})

async function resizeWindow(w: number, h: number): Promise<void> {
  if (!app) throw new Error('no app')
  await app.evaluate(({ BrowserWindow }, p) => {
    const b = BrowserWindow.getAllWindows()[0]
    if (b) b.setSize(p.w, p.h)
  }, { w, h })
  await page.waitForTimeout(500)
}

test('responsive: narrow windows (1100/1024) start with the Inspector closed and main accessible', async () => {
  for (const w of [1100, 1024]) {
    await resizeWindow(w, 700)
    // Inspector closed by default on narrow widths — no overlay scrim blocks.
    const inspector = page.getByRole('complementary', { name: '详情' })
    await expect(inspector).toBeHidden()
    // Rail + main are reachable (clicking the rail works, i.e. no scrim).
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '环境' }).click()
    await expect(page.getByRole('heading', { name: '环境就绪检查' })).toBeVisible()
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '工作区' }).click()
    await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible()
  }
})

test('responsive: narrow manual open shows overlay + scrim; Escape and scrim close it', async () => {
  await resizeWindow(1100, 700)
  const inspector = page.getByRole('complementary', { name: '详情' })
  await expect(inspector).toBeHidden()

  // User opens the Inspector -> overlay + scrim appear.
  await page.getByTitle('显示详情').click()
  await expect(inspector).toBeVisible()

  // Escape closes it.
  await page.keyboard.press('Escape')
  await expect(inspector).toBeHidden()

  // Reopen, then click the scrim to close.
  await page.getByTitle('显示详情').click()
  await expect(inspector).toBeVisible()
  await page.locator('body').click({ position: { x: 60, y: 200 } })
  await expect(inspector).toBeHidden()

  // Main is reachable again.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '工作区' }).click()
  await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible()
})

test('responsive: 1280 -> 1100 safely closes a default-open Inspector (no blocking overlay)', async () => {
  await resizeWindow(1280, 800)
  const inspector = page.getByRole('complementary', { name: '详情' })
  await expect(inspector).toBeVisible() // desktop default open

  // Shrink into the narrow range: the merely-default Inspector must close so its
  // scrim never blocks the Rail/Main.
  await resizeWindow(1100, 700)
  await expect(inspector).toBeHidden()
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '工作区' }).click()
  await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible()
})

test('responsive: 1100 -> 1280 restores the desktop Inspector without broken layout', async () => {
  await resizeWindow(1100, 700)
  const inspector = page.getByRole('complementary', { name: '详情' })
  await expect(inspector).toBeHidden()

  // Grow back to desktop: the default-open Inspector returns as a column, no scrim.
  await resizeWindow(1280, 800)
  await expect(inspector).toBeVisible()
  const scrim = page.locator('[role="presentation"].absolute.inset-0')
  await expect(scrim).toBeHidden()
  // Layout is intact (no horizontal overflow).
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }))
  expect(layout.overflow).toBe(false)
})
