import { locateExecutable, readExecutableVersion, registryValueExists } from '../utils/external-command'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { DiagnosticItem, DiagnosticReport } from '../../shared/ipc-types'
import { getSettingsGlobalPath, getWorkspaceRoot, getProjectRoot } from '../utils/paths'

export class DiagnosticsService {
  private last: DiagnosticReport | null = null
  private getRpStatus?: () => { mode: string; name?: string; sanitizedHost?: string }

  constructor(getRpStatus?: () => { mode: string; name?: string; sanitizedHost?: string }) {
    this.getRpStatus = getRpStatus
  }

  private item(id: string, title: string, status: DiagnosticItem['status'], summary: string, extra?: Partial<DiagnosticItem>): DiagnosticItem {
    return { id, title, status, summary, ...extra }
  }

  private checkReg(root: string, value: string): boolean {
    return registryValueExists(root, value)
  }

  private regItem(scope: 'hkcu' | 'hklm', key: string, root: string): DiagnosticItem {
    const exists = this.checkReg(root, key)
    return this.item(
      `reg-${scope}-${key.toLowerCase()}`,
      `注册表 ${scope.toUpperCase()}: ${key}`,
      exists ? (scope === 'hklm' ? 'error' : 'warn') : 'ok',
      exists ? '存在 (敏感值已隐藏)' : '不存在',
      { sensitive: true, fix: exists ? '请在 Windows 环境变量设置中删除此项，或使用 reg delete 手动清理。' : undefined }
    )
  }

  async runAll(): Promise<DiagnosticReport> {
    const settingsPath = getSettingsGlobalPath()
    const workspaceRoot = getWorkspaceRoot()
    const projectDir = getProjectRoot()

    const node = locateExecutable('node')
    const nodePath = node.ok ? node.val.split(/\r?\n/)[0] : ''
    const nodeV = nodePath ? readExecutableVersion(nodePath) : { ok: false, val: '' }
    const npm = locateExecutable('npm')
    const npmPath = npm.ok ? npm.val.split(/\r?\n/)[0] : ''
    const npmV = npmPath ? readExecutableVersion(npmPath) : { ok: false, val: '' }
    const claude = locateExecutable('claude')
    const claudePath = claude.ok ? claude.val.split(/\r?\n/)[0] : ''
    const claudeV = claudePath ? readExecutableVersion(claudePath) : { ok: false, val: '' }

    const envKeys = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'] as const
    let settings: Record<string, unknown> | null = null
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { /* file missing or parse error */ }
    const envSection = settings && typeof settings.env === 'object' ? (settings.env as Record<string, unknown>) : null
    const cfg = settings && typeof settings.api_test_config === 'object' ? (settings.api_test_config as Record<string, unknown>) : null
    const l = !!(cfg as Record<string, unknown> | null)?.['apiKey']; const r = !!(cfg as Record<string, unknown> | null)?.['apiKeyRef']

    const items: DiagnosticItem[] = [
      this.item('node-path', 'Node.js in PATH', node.ok ? 'ok' : 'error', node.ok ? node.val : '不在 PATH 中'),
      this.item('node-version', 'Node.js 版本', nodeV.ok ? 'ok' : 'error', nodeV.ok ? nodeV.val : '无法获取'),

      this.item('npm-path', 'npm in PATH', npm.ok ? 'ok' : 'error', npm.ok ? npm.val : '不在 PATH 中'),
      this.item('npm-version', 'npm 版本', npmV.ok ? 'ok' : 'error', npmV.ok ? npmV.val : '无法获取'),

      this.item('claude-path', 'Claude CLI in PATH', claude.ok ? 'ok' : 'error', claude.ok ? claude.val : '未安装 Claude CLI'),
      this.item('claude-version', 'Claude CLI 版本', claudeV.ok ? 'ok' : 'error', claudeV.ok ? claudeV.val : '无法获取版本'),

      ...envKeys.map(k => this.item('env-' + k.toLowerCase(), '环境变量: ' + k, process.env[k] ? 'warn' : 'ok',
        process.env[k] ? '存在 (敏感值已隐藏)' : '不存在', { sensitive: true })),

      this.item('settings-file', 'settings.json', settings !== null ? 'ok' : 'error', settings !== null ? '存在' : '不存在'),
      this.item('settings-env', 'settings.json env 段', !envSection || Object.keys(envSection).length === 0 ? 'ok' : 'warn',
        !envSection || Object.keys(envSection).length === 0 ? '为空' : '包含 ' + Object.keys(envSection).length + ' 个字段'),
      this.item('settings-provider', 'settings.json api_provider', !settings || !settings['api_provider'] ? 'ok' : 'warn',
        !settings || !settings['api_provider'] ? '不存在' : '存在 (敏感值已隐藏)', { sensitive: true }),
      this.item('settings-model', 'settings.json model', !settings || !settings['model'] ? 'ok' : 'warn',
        !settings || !settings['model'] ? '不存在' : '存在'),

      this.item('workspace-dir', '工作目录', existsSync(workspaceRoot) ? 'ok' : 'error', existsSync(workspaceRoot) ? workspaceRoot : '不存在', { displaySummary: existsSync(workspaceRoot) ? '[workspace] 存在' : '不存在' }),
      this.item('project-dir', '项目目录', existsSync(projectDir) ? 'ok' : 'error', existsSync(projectDir) ? projectDir : '不存在', { displaySummary: existsSync(projectDir) ? '[project] 存在' : '不存在' }),
      this.item('package-json', 'package.json', existsSync(join(projectDir, 'package.json')) ? 'ok' : 'error',
        existsSync(join(projectDir, 'package.json')) ? '存在' : '不存在'),
      this.regItem('hkcu', 'ANTHROPIC_BASE_URL', 'HKCU\\Environment'),
      this.regItem('hkcu', 'ANTHROPIC_AUTH_TOKEN', 'HKCU\\Environment'),
      this.regItem('hkcu', 'ANTHROPIC_API_KEY', 'HKCU\\Environment'),
      this.regItem('hkcu', 'ANTHROPIC_MODEL', 'HKCU\\Environment'),
      this.regItem('hklm', 'ANTHROPIC_BASE_URL', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'),
      this.regItem('hklm', 'ANTHROPIC_AUTH_TOKEN', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'),
      this.regItem('hklm', 'ANTHROPIC_API_KEY', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'),
      this.regItem('hklm', 'ANTHROPIC_MODEL', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'),

      { id: 'api-config-format', title: 'API 配置存储格式', status: !cfg ? 'info' : l ? 'warn' : r ? 'ok' : 'info', summary: !cfg ? '未配置' : l ? '旧明文存储' : '安全格式' },
      { id: 'api-config-legacy-key', title: '旧明文密钥字段', status: l ? 'warn' : 'ok', summary: l ? '存在（敏感值已隐藏）' : '不存在', sensitive: l || undefined },
      { id: 'api-config-secret-ref', title: 'API 密钥安全引用', status: !cfg ? 'info' : r ? 'ok' : 'warn', summary: !cfg ? '未配置' : r ? '存在安全引用' : '旧格式，无安全引用' },
      (() => { try { const rp = this.getRpStatus?.(); if (!rp || rp.mode === 'default') return { id: 'runtime-provider-status', title: 'Runtime Provider', status: 'ok' as const, summary: 'Default' }; const lb = [rp.name, rp.sanitizedHost].filter(Boolean).join(' / ') || 'Custom Provider'; return { id: 'runtime-provider-status', title: 'Runtime Provider', status: 'info' as const, summary: 'Custom Provider: ' + lb } } catch { return { id: 'runtime-provider-status', title: 'Runtime Provider', status: 'warn' as const, summary: 'Runtime provider status unavailable' } } })(),
    ]

    const summary = { ok: 0, warn: 0, error: 0, info: 0 }
    for (const item of items) summary[item.status]++
    const report: DiagnosticReport = { timestamp: Date.now(), items, summary }
    this.last = report
    return report
  }

  getLastReport(): DiagnosticReport | null { return this.last }
}
