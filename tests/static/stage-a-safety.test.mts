import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('Stage A visible controls do not retain known hard-coded Chinese copy', () => {
  const settings = read('src/renderer/components/editors/SettingsEditor.tsx')
  const sidebar = read('src/renderer/components/layout/Sidebar.tsx')
  const terminal = read('src/renderer/components/layout/TerminalPanel.tsx')

  for (const literal of [
    "setDiagError('诊断失败:",
    "setTestResult('连接失败')",
    '>查看<',
    '>知道了<',
    "runtimeState.apiProvider || '无'",
    ": '打包失败'",
    '>已删除:',
    '>备份:',
    '❌ 恢复失败:'
  ]) assert.ok(!settings.replace(/\s+/g, '').includes(literal.replace(/\s+/g, '')), `SettingsEditor contains ${literal}`)

  assert.doesNotMatch(sidebar, /title="(?:展开|收起)侧边栏"/)
  assert.doesNotMatch(terminal, /title="[^"]*[\u4e00-\u9fff][^"]*"/)
  assert.doesNotMatch(terminal, /label: '(?:复制|粘贴|清屏)'/)
})

test('locale changes do not retrigger Project Capsule or readiness IPC loads', () => {
  // All data-loading surfaces load once on mount (no `t`-dependence in the
  // load callback), so a locale switch never retriggers IPC.
  for (const path of [
    'src/renderer/components/editors/ProjectCapsule.tsx',
    'src/renderer/components/editors/ReadyCheckPanel.tsx',
    'src/renderer/components/editors/LaunchConfirmation.tsx',
    'src/renderer/components/views/WorkspaceDesk.tsx'
  ]) assert.doesNotMatch(read(path), /useCallback\([\s\S]*?\}, \[t\]\)/, `${path} reloads when locale changes`)

  // The workspace home (WorkspaceDesk) loads real data once; the Environment
  // view (in AppShell) guards its diagnostics run with an in-flight ref so a
  // locale switch never retriggers IPC.
  const shell = read('src/renderer/components/layout/AppShell.tsx')
  assert.match(shell, /inFlightRef\.current/)

  const terminal = read('src/renderer/components/layout/TerminalPanel.tsx')
  assert.doesNotMatch(terminal, /\}, \[t\]\)/, 'TerminalPanel reloads or recreates xterm when locale changes')
  assert.match(terminal, /addEventListener\('agent-workbench:capsule-updated'/)
  assert.match(read('src/renderer/components/editors/ProjectCapsule.tsx'), /dispatchEvent\(new Event\('agent-workbench:capsule-updated'\)\)/)
})

test('Stage A secret display uses one fixed mask and exposes no key fragments', () => {
  const api = read('src/main/ipc/api.ts')
  assert.match(api, /function derivePrefix[\s\S]*return '\*{8}'/)
  assert.doesNotMatch(api, /key\.slice\s*\(/)
  assert.doesNotMatch(api, /np\s*=\s*oc\[['"]apiKeyPrefix['"]\]/)
  assert.match(api, /apiKeyPrefix: ref \? '\*{8}' : ''/)
  assert.match(api, /cfg\[['"]apiKeyPrefix['"]\]\s*=\s*'\*{8}'[\s\S]*writeSettings\(settings\)/)
})

test('Stage A dynamic IPC messages are mapped to locale-owned copy', () => {
  const settings = read('src/renderer/components/editors/SettingsEditor.tsx')
  // Removed surfaces (API / Provider / Share / Claude detection) must not resurface
  // raw backend messages.
  assert.doesNotMatch(settings, /setTestResult\(r\.message\)/)
  assert.doesNotMatch(settings, /alert\(['"]Error:/)
  assert.doesNotMatch(settings, /providerSetResult\.message|packageResult\.error|packageResult\.securityScan\.message|String\(resetResult\.message\)/)
  // Remaining dynamic-message surfaces use locale-owned copy, not raw backend text
  // (the Integrity Check surface that used settings.integrityCheckFailed was
  // removed in the Settings cutover; AppShell below still exercises this rule).
  const shell = read('src/renderer/components/layout/AppShell.tsx')
  assert.match(shell, /diag\.failed/)
  const desk = read('src/renderer/components/views/WorkspaceDesk.tsx')
  assert.doesNotMatch(desk, /\{error\}/, 'WorkspaceDesk must not render a raw backend error string')
})

test('Stage A capsule notes are sanitized before storage and on legacy load', () => {
  const capsule = read('src/main/ipc/capsule.ts')
  assert.match(capsule, /function sanitizeFreeText/)
  assert.match(capsule, /function redactCredentialLike/)
  assert.match(capsule, /const safeNotes = sanitizeFreeText\(rawNotes\)/)
  assert.match(capsule, /notes: safeNotes/)
  assert.match(capsule, /projectName: safeProjectName/)
  assert.match(capsule, /data\.notes = safeNotes[\s\S]*writeFileSync\(path/)
})

test('Stage A terminal launch gates use native disabled controls', () => {
  const terminal = read('src/renderer/components/layout/TerminalPanel.tsx')
  assert.match(terminal, /disabled=\{!canReview\}/)
  assert.doesNotMatch(terminal, /window\.api\.terminal\.start\s*\(/)

  const preload = read('src/preload/index.ts')
  assert.doesNotMatch(preload, /start: \(\) => ipcRenderer\.invoke\(IPC_CHANNELS\.TERMINAL_START\)/)
  const legacyTerminal = read('src/main/ipc/terminal.ts')
  assert.doesNotMatch(legacyTerminal, /processManager\.start\s*\(/)
})

test('Stage A renderer cannot start an Agent and contains no remote release mutator', () => {
  const rendererFiles = [
    'src/renderer/components/editors/DiagnosticsPanel.tsx',
    'src/renderer/components/editors/LaunchConfirmation.tsx',
    'src/renderer/components/editors/ProjectCapsule.tsx',
    'src/renderer/components/editors/ReadyCheckPanel.tsx',
    'src/renderer/components/editors/SettingsEditor.tsx',
    'src/renderer/components/layout/Sidebar.tsx',
    'src/renderer/components/layout/TerminalPanel.tsx'
  ]
  const source = rendererFiles.map(read).join('\n')
  assert.doesNotMatch(source, /window\.api\.terminal\.start\s*\(/)
  assert.doesNotMatch(source, /\bgit\s+(?:push|tag)\b|\bgh\s+release\s+create\b/i)
})

test('Stage A Verification readiness does not read legacy API config in the active UI', () => {
  // MAJOR-2: the 0.1.2 Verification path (local controlled node --test) needs no
  // Provider/API key, so the active Project Desk / Environment readiness must not
  // call api.loadConfig() nor re-render the cut-over API-key copy.
  const desk = read('src/renderer/components/views/WorkspaceDesk.tsx')
  const ready = read('src/renderer/components/editors/ReadyCheckPanel.tsx')
  for (const label of ['WorkspaceDesk', 'ReadyCheckPanel']) {
    const src = label === 'WorkspaceDesk' ? desk : ready
    assert.doesNotMatch(src, /window\.api\.api\.loadConfig/, `${label} still reads legacy API config`)
    assert.doesNotMatch(src, /apiConfig|hasKey|hasLegacyKey/, `${label} still wires API key into readiness`)
  }
  assert.doesNotMatch(ready, /API key configured|set up API key in Settings|configure a provider and API key/)
})

test('Stage A Settings and Readiness use theme-aware, product-aligned surfaces', () => {
  // Human-smoke findings: the active Settings must not keep the legacy
  // source-integrity dev tool, the stale About branding, or dark-only styles.
  const settings = read('src/renderer/components/editors/SettingsEditor.tsx')
  assert.doesNotMatch(settings, /maintenance\.integrityCheck|maintenance\.integrityRepair/, 'Settings still wires the legacy integrity dev tool')
  assert.doesNotMatch(settings, /settings\.integrity/, 'Settings still renders the Integrity Check section')
  assert.doesNotMatch(settings, /xterm\.js|node-pty/, 'About still shows the legacy terminal stack')
  assert.doesNotMatch(settings, /0\.1\.0/, 'About still shows a stale version')

  const ready = read('src/renderer/components/editors/ReadyCheckPanel.tsx')
  assert.doesNotMatch(ready, /bg-gray-900|text-gray-200|border-gray-800|bg-gray-950|text-\[9px\]/, 'ReadyCheckPanel still uses dark-only hardcoded styling')
  assert.match(ready, /var\(--bg-secondary\)/, 'ReadyCheckPanel not theme-driven')
})
