import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { execFileSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

let electronApp: ElectronApplication | undefined
let page: Page
let fixtureRoot = ''

const fakeOpenAiKey = (suffix: string): string => ['sk', suffix].join('-')

async function openSettings(): Promise<void> {
  await page.getByRole('button', { name: /设置$/ }).click()
  await expect(page.getByRole('heading', { name: 'API 配置' })).toBeVisible()
}

async function switchToEnglish(): Promise<void> {
  await page.getByRole('button', { name: /语言$/ }).click()
  await page.getByRole('button', { name: /English$/ }).click()
  await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible()
}

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-stage-a-'))
  const directories = [
    'workspace/memory',
    'workspace/skills',
    'workspace/projects',
    'workspace/.claude',
    'settings',
    'project',
    'backups',
    'user-data',
    'temp',
    'app-data',
    'local-app-data'
  ]
  for (const directory of directories) mkdirSync(join(root, directory), { recursive: true })
  writeFileSync(join(root, 'workspace', 'CLAUDE.md'), '# Fixture workspace\n', 'utf8')
  writeFileSync(join(root, 'settings', 'settings.json'), '{}\n', 'utf8')
  return root
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  await new Promise<void>((resolveExit, reject) => {
    const timeout = setTimeout(() => reject(new Error('Electron process did not exit within 10 seconds')), 10_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolveExit()
    })
  })
}

function ensureNoFixtureProcesses(marker: string): void {
  const escapedMarker = marker.replace(/'/g, "''")
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$marker = '${escapedMarker}'`,
    '$matches = @()',
    'for ($attempt = 0; $attempt -lt 20; $attempt++) {',
    "  $matches = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($marker) })",
    '  if ($matches.Count -eq 0) { exit 0 }',
    '  Start-Sleep -Milliseconds 250',
    '}',
    "$details = ($matches | ForEach-Object { \"$($_.ProcessId):$($_.Name)\" }) -join ', '",
    '$matches | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    'throw "Fixture process leak: $details"'
  ].join('; ')
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'pipe' })
}

test.beforeEach(async ({}, testInfo) => {
  fixtureRoot = createFixture()
  if (testInfo.title.includes('legacy API key prefix')) {
    writeFileSync(join(fixtureRoot, 'settings', 'settings.json'), JSON.stringify({
      api_test_config: {
        provider: 'OpenAI',
        baseUrl: 'https://example.invalid',
        apiKeyPrefix: fakeOpenAiKey('old...1234'),
        apiKeyRef: 'api:test:legacy-fixture'
      }
    }, null, 2), 'utf8')
  }
  const repoRoot = resolve(process.cwd())
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const childEnv: NodeJS.ProcessEnv = {
    AGENT_WORKBENCH_E2E: '1',
    AGENT_WORKBENCH_FIXTURE_ROOT: fixtureRoot,
    USERPROFILE: fixtureRoot,
    APPDATA: join(fixtureRoot, 'app-data'),
    LOCALAPPDATA: join(fixtureRoot, 'local-app-data'),
    TEMP: join(fixtureRoot, 'temp'),
    TMP: join(fixtureRoot, 'temp'),
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    ComSpec: process.env.ComSpec ?? join(systemRoot, 'System32', 'cmd.exe'),
    PATH: `${join(systemRoot, 'System32')};${systemRoot}`
  }

  electronApp = await electron.launch({
    executablePath: join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: ['.', `--user-data-dir=${join(fixtureRoot, 'user-data')}`],
    cwd: repoRoot,
    env: childEnv
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterEach(async () => {
  const rootToClean = fixtureRoot
  fixtureRoot = ''
  let teardownError: unknown
  if (electronApp) {
    const app = electronApp
    const child = app.process()
    electronApp = undefined
    try {
      await app.close()
      await waitForExit(child)
      expect(child.exitCode).not.toBeNull()
    } catch (error) {
      teardownError = error
    }
  }
  try {
    if (rootToClean) ensureNoFixtureProcesses(rootToClean)
  } catch (error) {
    teardownError ??= error
  } finally {
    if (rootToClean) rmSync(rootToClean, { recursive: true, force: true })
  }
  if (teardownError) throw teardownError
})

test('real Electron main/preload/renderer starts inside an isolated fixture with launch gates closed', async () => {
  await expect(page.getByRole('heading', { name: 'Agent Workbench' })).toBeVisible()

  const bridge = await page.evaluate(() => ({
    diagnosticsRun: typeof (window as any).api?.diagnostics?.run,
    capsuleLoad: typeof (window as any).api?.capsule?.load,
    terminalStart: typeof (window as any).api?.terminal?.start
  }))
  expect(bridge).toEqual({ diagnosticsRun: 'function', capsuleLoad: 'function', terminalStart: 'undefined' })

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toContain(fixtureRoot)
  expect(bodyText).not.toMatch(/[A-Za-z]:\\[^\s]+/)
  expect(bodyText).not.toMatch(/\\\\[^\\]+\\[^\s]+/)

  const launchButton = page.getByRole('button', { name: /Launch Agent|启动 Agent/ })
  await expect(launchButton).toBeDisabled()

  const terminalGate = page.getByRole('button', { name: /Review & Launch|检查并启动/ })
  await expect(terminalGate).toBeVisible()
  await expect(terminalGate).toBeDisabled()
  await expect(terminalGate).toHaveAttribute('class', /cursor-not-allowed/)
})

test('Chinese welcome does not retain ordinary English status copy', async () => {
  const bodyText = await page.locator('body').innerText()
  for (const forbidden of [
    'Current Workspace', 'Provider: default', 'No Key', 'Phase 1 active', 'Build verified', 'Pack blocked',
    'Not found', 'Not installed', 'Environment variables', 'Windows Registry', 'Settings env',
    'API key configured', 'Open Settings to configure', 'Project Capsule', 'Using safe default'
  ]) {
    expect(bodyText, `unexpected English UI copy: ${forbidden}`).not.toContain(forbidden)
  }
})

test('English API and diagnostics views contain no Chinese UI copy and preserve the report across locale navigation', async () => {
  await openSettings()
  await page.getByRole('button', { name: /环境诊断$/ }).click()
  const runDiagnosticsButton = page.getByRole('button', { name: /运行诊断/ })
  const disabledDuringRun = await runDiagnosticsButton.evaluate(async element => {
    ;(element as HTMLButtonElement).click()
    await new Promise<void>(resolveFrame => requestAnimationFrame(() => resolveFrame()))
    return (element as HTMLButtonElement).disabled
  })
  expect(disabledDuringRun).toBe(true)
  await expect(page.getByRole('button', { name: /复制诊断摘要/ })).toBeVisible()

  const before = await page.evaluate(async () => (await (window as any).api.diagnostics.getLastReport())?.timestamp ?? null)
  expect(before).not.toBeNull()

  await page.getByRole('button', { name: /语言$/ }).click()
  await page.getByRole('button', { name: /English$/ }).click()
  await page.getByRole('button', { name: /Environment Diagnostics$/ }).click()
  await expect(page.getByRole('button', { name: /Copy Diagnostics Summary/ })).toBeVisible()

  const after = await page.evaluate(async () => (await (window as any).api.diagnostics.getLastReport())?.timestamp ?? null)
  expect(after).toBe(before)

  const reportItemCount = await page.evaluate(async () => (await (window as any).api.diagnostics.getLastReport())?.items.length ?? 0)
  expect(reportItemCount).toBe(29)

  await page.evaluate(() => {
    ;(window as any).__capturedClipboard = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as any).__capturedClipboard = text
        }
      }
    })
  })
  await page.getByRole('button', { name: /Copy Diagnostics Summary/ }).click()
  const copied = await page.evaluate(() => (window as any).__capturedClipboard as string)
  expect(copied).toContain('Environment Diagnostics Report')
  expect(copied).not.toMatch(/[\u4e00-\u9fff]/)
  expect(copied).not.toContain(fixtureRoot)
  expect(copied).not.toMatch(/[A-Za-z]:\\[^\s]+/)

  await page.getByRole('button', { name: /API Configuration/ }).click()
  const englishApiText = await page.locator('body').innerText()
  expect(englishApiText).not.toMatch(/[\u4e00-\u9fff]/)

  await page.getByRole('button', { name: /Share Package$/ }).click()
  const englishShareText = await page.locator('body').innerText()
  expect(englishShareText).not.toMatch(/[\u4e00-\u9fff]/)
})

test('English API connection failure uses renderer locale copy without external network', async () => {
  await openSettings()
  await switchToEnglish()
  await page.getByRole('button', { name: /API Configuration$/ }).click()

  await page.getByPlaceholder('https://api.openai.com/v1').fill('not-a-valid-url')
  await page.locator('input[type="password"]').fill(fakeOpenAiKey('e2e-localhost-only'))
  await page.getByRole('button', { name: 'Test Connection', exact: true }).click()
  await expect(page.getByText(/Connection failed/).first()).toBeVisible()

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(/[\u4e00-\u9fff]/)
})

test('saved fixture API key is displayed with a fixed mask only', async () => {
  const fakeKey = fakeOpenAiKey('e2e-fixed-mask-0123456789abcdef1234')
  await openSettings()

  await page.getByPlaceholder('https://api.openai.com/v1').fill('https://api.example.com/v1')
  const keyInput = page.locator('input[type="password"]')
  await keyInput.fill(fakeKey)
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(page.getByText('✓ 已保存', { exact: true })).toBeVisible()

  const maskedInput = page.locator('input[type="text"][disabled]').first()
  await expect(maskedInput).toHaveValue('********')
  await expect(maskedInput).not.toHaveValue(/sk-e2e|1234/)

  const savedSettings = readFileSync(join(fixtureRoot, 'settings', 'settings.json'), 'utf8')
  const parsedSettings = JSON.parse(savedSettings) as { api_test_config?: Record<string, unknown> }
  expect(parsedSettings.api_test_config?.apiKeyPrefix).toBe('********')
  expect(parsedSettings.api_test_config).not.toHaveProperty('apiKey')
  expect(savedSettings).not.toContain(fakeKey)
  expect(savedSettings).not.toContain(fakeOpenAiKey('e2e'))
  expect(savedSettings).not.toContain('1234')

  const bindingResult = await page.evaluate(async () => {
    const api = (window as any).api
    const saved = await api.api.loadConfig()
    const rejected = await api.runtime.setProvider({
      apiKeyRef: saved.apiKeyRef,
      baseUrl: 'https://attacker.invalid/v1',
      name: 'Rejected fixture'
    })
    const accepted = await api.runtime.setProvider({
      apiKeyRef: saved.apiKeyRef,
      baseUrl: saved.baseUrl,
      name: 'Bound fixture'
    })
    await api.runtime.clearProvider()
    return { rejected, accepted }
  })
  expect(bindingResult.rejected.success).toBe(false)
  expect(bindingResult.accepted.success, JSON.stringify(bindingResult)).toBe(true)
})

test('legacy API key prefix is migrated on load without exposing fragments', async () => {
  const loaded = await page.evaluate(async () => (window as any).api.api.loadConfig())
  expect(loaded.apiKeyPrefix).toBe('********')

  const savedSettings = readFileSync(join(fixtureRoot, 'settings', 'settings.json'), 'utf8')
  const parsedSettings = JSON.parse(savedSettings) as { api_test_config?: Record<string, unknown> }
  expect(parsedSettings.api_test_config?.apiKeyPrefix).toBe('********')
  expect(savedSettings).not.toContain(fakeOpenAiKey('old'))
  expect(savedSettings).not.toContain('1234')
})

test('capsule save reloads the sanitized path before rendering', async () => {
  const fakeKey = fakeOpenAiKey('e2e-capsule-secret-0123456789')
  const fakeToken = 'capsule-token-0123456789'
  const fakeAuthToken = 'anthropic-auth-fixture-0123456789'
  await page.evaluate(() => localStorage.setItem('agent-workbench-locale', 'en'))
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: 'Edit Capsule' }).click()

  await page.getByPlaceholder('e.g. My Agent Project').fill(fakeKey)
  const repeatedPlaceholderInputs = page.getByPlaceholder('e.g. agent-workbench-desktop')
  await repeatedPlaceholderInputs.nth(0).fill(`token: ${fakeToken}`)
  await repeatedPlaceholderInputs.nth(1).fill(fixtureRoot)
  await page.getByPlaceholder('Add project context, handoff notes, or next steps...').fill(`Fixture path: ${fixtureRoot}; API_KEY=${fakeKey}; ANTHROPIC_AUTH_TOKEN=${fakeAuthToken}`)
  await page.getByRole('button', { name: 'Save Capsule' }).click()
  await expect(page.getByRole('button', { name: 'Edit Capsule' })).toBeVisible()

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toContain(fixtureRoot)
  expect(bodyText).not.toContain(fakeKey)
  expect(bodyText).not.toContain(fakeToken)
  expect(bodyText).not.toContain(fakeAuthToken)
  expect(bodyText).toContain(basename(fixtureRoot))
  expect(bodyText).toContain('********')
  expect(bodyText).toContain('[path hidden]')

  const savedCapsule = readFileSync(join(fixtureRoot, 'workspace', 'memory', 'project-capsule.json'), 'utf8')
  const parsedCapsule = JSON.parse(savedCapsule) as { safePathLabel?: string; notes?: string }
  expect(parsedCapsule.safePathLabel).toBe(basename(fixtureRoot))
  expect(parsedCapsule.notes).toContain('[path hidden]')
  expect(savedCapsule).not.toContain(fixtureRoot)
  expect(savedCapsule).not.toContain(fakeKey)
  expect(savedCapsule).not.toContain(fakeToken)
  expect(savedCapsule).not.toContain(fakeAuthToken)
})
