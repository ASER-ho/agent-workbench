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
  for (const path of [
    'src/renderer/components/editors/ProjectCapsule.tsx',
    'src/renderer/components/editors/ReadyCheckPanel.tsx',
    'src/renderer/components/editors/LaunchConfirmation.tsx'
  ]) assert.doesNotMatch(read(path), /useCallback\([\s\S]*?\}, \[t\]\)/, `${path} reloads when locale changes`)

  const settings = read('src/renderer/components/editors/SettingsEditor.tsx')
  assert.match(settings, /diagInFlightRef\.current/)

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
  assert.doesNotMatch(settings, /setTestResult\(r\.message\)/)
  assert.doesNotMatch(settings, /alert\(['"]Error:/)
  assert.doesNotMatch(settings, /providerSetResult\.message|packageResult\.error|packageResult\.securityScan\.message|String\(resetResult\.message\)/)
  assert.match(settings, /settings\.apiConnectionSuccess/)
  assert.match(settings, /settings\.integrityCheckFailed/)
  assert.match(settings, /settings\.detectFailed/)
  assert.match(settings, /settings\.shareSecurityPassed/)
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
