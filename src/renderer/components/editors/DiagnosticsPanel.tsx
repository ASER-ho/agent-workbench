import { useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import type { DiagnosticReport } from '../../../shared/ipc-types'

/** Extract basename from path-like strings; leave non-path text unchanged. */
function sanitizeDiagSummary(text: string): string {
  if (!text) return text
  if (/[A-Za-z]:[\\/]/.test(text) || /[\\/]/.test(text)) {
    const cleaned = text.replace(/\\/g, '/').replace(/\/+$/, '')
    const basename = cleaned.split('/').pop()
    if (basename && basename.length < cleaned.length) return basename
  }
  return text
}

/** Map known server-generated strings (zh/en mixed) to locale-aware display.
 *  This is a renderer-side translation layer for IPC-generated diagnostic data. */
function translateServerString(text: string, t: (k: string) => string): string {
  if (!text) return text
  const map: Record<string, string> = {
    // Titles — server diagnostics.ts generates mixed zh/en
    'Node.js in PATH': t('diag.tNodePath'),
    'Node.js 版本': t('diag.tNodeVersion'),
    'npm in PATH': t('diag.tNpmPath'),
    'npm 版本': t('diag.tNpmVersion'),
    'Claude CLI in PATH': t('diag.tClaudePath'),
    'Claude CLI 版本': t('diag.tClaudeVersion'),
    // Summaries — server generates zh strings
    '不在 PATH 中': t('diag.sNotInPath'),
    '无法获取': t('diag.sUnavailable'),
    '无法获取版本': t('diag.sVersionUnavailable'),
    '未安装 Claude CLI': t('diag.sClaudeNotInstalled'),
    '存在 (敏感值已隐藏)': t('diag.sExistsHidden'),
    '存在（敏感值已隐藏）': t('diag.sExistsHidden'),
    '不存在': t('diag.sNotFound'),
    '为空': t('diag.sEmpty'),
    '包含 ': t('diag.sContains'), // partial match handled below
    '存在': t('diag.sExists'),
    '未配置': t('diag.sNotConfigured'),
    '旧明文存储': t('diag.sLegacyPlaintext'),
    '安全格式': t('diag.sSecureFormat'),
    '旧格式，无安全引用': t('diag.sLegacyNoRef'),
    '存在安全引用': t('diag.sHasSecureRef'),
    'Default': t('diag.sDefault'),
    // Additional unmapped server strings
    'settings.json env 段': t('diag.tSettingsEnv'),
    '工作目录': t('diag.tWorkspaceDir'),
    '项目目录': t('diag.tProjectDir'),
    'API 配置存储格式': t('diag.tApiConfigFormat'),
    '旧明文密钥字段': t('diag.tLegacyKeyField'),
    'API 密钥安全引用': t('diag.tApiKeyRef'),
    '[workspace] 存在': t('diag.sWorkspaceExists'),
    '[project] 存在': t('diag.sProjectExists'),
    'settings.json': t('diag.tSettingsFile'),
    'api_provider': t('diag.tApiProvider'),
    'model': t('diag.tModel'),
    'package.json': t('diag.tPackageJson'),
    'Runtime Provider': t('diag.tRuntimeProvider'),
    '请在 Windows 环境变量设置中删除此项，或使用 reg delete 手动清理。': t('diag.fixRegistry'),
  }
  // Exact match
  if (map[text]) return map[text]
  // Partial match: "包含 N 个字段"
  if (text.startsWith('包含 ') && text.endsWith(' 个字段')) {
    const n = text.replace('包含 ', '').replace(' 个字段', '')
    return t('diag.sContainsFields').replace('{n}', n)
  }
  // Environment variable titles: "环境变量: NAME"
  if (text.startsWith('环境变量: ')) {
    return t('diag.tEnvVar').replace('{name}', text.replace('环境变量: ', ''))
  }
  // Registry titles: "注册表 HKCU: NAME" / "注册表 HKLM: NAME"
  if (text.startsWith('注册表 HKCU: ')) {
    return t('diag.tRegHkcu').replace('{name}', text.replace('注册表 HKCU: ', ''))
  }
  if (text.startsWith('注册表 HKLM: ')) {
    return t('diag.tRegHklm').replace('{name}', text.replace('注册表 HKLM: ', ''))
  }
  return text
}

/** Map diagnostic status to locale-aware label. */
function localizeDiagStatus(status: string, t: (k: string) => string): string {
  if (status === 'ok') return t('diag.statusOk')
  if (status === 'warn') return t('diag.statusWarn')
  if (status === 'error') return t('diag.statusError')
  if (status === 'info') return t('diag.statusInfo')
  return status.toUpperCase()
}

/** Build a safe text summary for clipboard copy — no full paths, no sensitive detail. */
function formatReport(r: DiagnosticReport, t: (k: string) => string): string {
  const lines: string[] = [
    `=== ${t('diag.reportTitle')} ===`,
    t('diag.reportTime') + ': ' + new Date(r.timestamp).toLocaleString(),
    r.summary.ok + ' ' + localizeDiagStatus('ok', t) + '  ' + r.summary.warn + ' ' + localizeDiagStatus('warn', t) + '  ' + r.summary.error + ' ' + localizeDiagStatus('error', t) + '  ' + r.summary.info + ' ' + localizeDiagStatus('info', t),
    ''
  ]
  for (const item of r.items) {
    const safeSummary = translateServerString(sanitizeDiagSummary(item.displaySummary || item.summary), t)
    const safeFix = item.fix ? translateServerString(item.fix, t) : ''
    lines.push(localizeDiagStatus(item.status, t) + '  ' + translateServerString(item.title, t) + '\n  ' + safeSummary + (safeFix ? '\n  \u{1F4A1} ' + safeFix : ''))
    lines.push('')
  }
  return lines.join('\n')
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); document.execCommand('copy')
      ta.remove(); return true
    } catch { return false }
  }
}

interface DiagnosticsPanelProps {
  report: DiagnosticReport | null
  loading: boolean
  error: string | null
  onRun: () => Promise<void>
}

export default function DiagnosticsPanel({ report, loading, error, onRun }: DiagnosticsPanelProps) {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const handleCopy = async () => {
    if (!report) return
    setCopyError(false)
    const ok = await copyText(formatReport(report, t))
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    else { setCopyError(true); setTimeout(() => setCopyError(false), 2000) }
  }

  const badge = (s: string) => {
    const m: Record<string, string> = {
      ok: 'bg-green-600 text-green-100',
      warn: 'bg-yellow-600 text-yellow-100',
      error: 'bg-red-600 text-red-100',
      info: 'bg-blue-600 text-blue-100'
    }
    return `px-2 py-0.5 rounded text-[10px] font-medium ${m[s] || 'bg-gray-600'}`
  }

  return (
    <div className="max-w-2xl">
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{'\u{1F52C}'} {t('diag.title')}</h3>
      <p className="text-[11px] mb-4" style={{ color: 'var(--text-tertiary)' }}>{t('diag.desc')}</p>

      <button onClick={onRun} disabled={loading} className="btn btn-primary text-xs mb-4">
        {loading ? t('diag.running') : t('diag.run')}
      </button>

      {error && (
        <div className="text-xs rounded-lg p-3 mb-4 border" style={{ background: '#7f1d1d', borderColor: '#dc2626', color: '#fca5a5' }}>
          {'❌'} {error}
        </div>
      )}

      {report && (
        <div className="space-y-3">
          <div className="flex gap-3 text-xs">
            {(['ok', 'warn', 'error', 'info'] as const).map(s => (
              <div key={s} className="rounded-lg p-3 flex-1 border text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <div className={`text-lg font-bold ${s === 'ok' ? 'text-green-500' : s === 'warn' ? 'text-yellow-500' : s === 'error' ? 'text-red-500' : 'text-blue-500'}`}>
                  {report.summary[s]}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{localizeDiagStatus(s, t)}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mb-3">
            <button onClick={handleCopy} className="text-xs px-3 py-1.5 rounded"
              style={{ background: copied ? '#059669' : 'var(--bg-secondary)', color: copied ? 'white' : 'var(--text-primary)', border: '1px solid ' + (copied ? '#059669' : 'var(--border-color)') }}>
              {copied ? t('diag.copied') : copyError ? t('diag.copyFailed') : '\u{1F4CB} ' + t('diag.copy')}
            </button>
          </div>

          <div className="space-y-1">
            {report.items.map(item => (
              <div key={item.id} className="rounded-lg border p-3 text-xs" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={badge(item.status)}>{localizeDiagStatus(item.status, t)}</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{translateServerString(item.title, t)}</span>
                </div>
                {/* displaySummary with path sanitization and server string translation */}
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{translateServerString(sanitizeDiagSummary(item.displaySummary || item.summary), t)}</div>
                {item.fix && (
                  <div className="text-[10px] mt-1" style={{ color: '#f59e0b' }}>{'\u{1F4A1}'} {translateServerString(item.fix, t)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
