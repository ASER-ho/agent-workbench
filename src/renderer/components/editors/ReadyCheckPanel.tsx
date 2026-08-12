import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import type { DiagnosticReport } from '../../../shared/ipc-types'
import { evaluateReadiness, type ReadinessResult, type CheckStatus } from '../../lib/readiness-rules'
import { useLocale } from '../../contexts/LocaleContext'

function statusIcon(s: CheckStatus): string {
  if (s === 'ok') return '✓'
  if (s === 'warn') return '⚠'
  if (s === 'error') return '✗'
  return '—'
}

/** Theme-aware status color (CSS variable so light/dark both read correctly). */
function statusColor(s: CheckStatus): string {
  if (s === 'ok') return 'var(--verified)'
  if (s === 'warn') return 'var(--warn)'
  if (s === 'error') return 'var(--failed)'
  return 'var(--text-tertiary)'
}

function verdictLabel(v: string, t: (k: string) => string): string {
  if (v === 'ready') return t('readiness.ready')
  if (v === 'almost-ready') return t('readiness.almostReady')
  if (v === 'not-ready') return t('readiness.notReady')
  return t('readiness.checking')
}

function verdictStyle(v: string): CSSProperties {
  if (v === 'ready') return { background: 'var(--verified-soft)', borderColor: 'var(--border-color)', color: 'var(--verified)' }
  if (v === 'almost-ready') return { background: 'var(--warn-soft)', borderColor: 'var(--border-color)', color: 'var(--warn)' }
  if (v === 'not-ready') return { background: 'var(--failed-soft)', borderColor: 'var(--border-color)', color: 'var(--failed)' }
  return { background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }
}

function localizeReadinessText(text: string | undefined, t: (k: string) => string): string {
  if (!text) return ''
  const keys: Record<string, string> = {
    'Environment variables': 'readiness.raw.environmentVariables',
    'Windows Registry': 'readiness.raw.windowsRegistry',
    'Settings env': 'readiness.raw.settingsEnv',
    'Build': 'readiness.raw.build',
    'Project Capsule': 'readiness.raw.projectCapsule',
    'Available': 'readiness.raw.available',
    'Not found': 'readiness.raw.notFound',
    'Check needed': 'readiness.raw.checkNeeded',
    'Not installed': 'readiness.raw.notInstalled',
    'Clean — no Anthropic env vars detected': 'readiness.raw.envClean',
    'Anthropic env vars detected': 'readiness.raw.envDetected',
    'System or user env vars could interfere with runtime. Run Safe Mode to clean.': 'readiness.raw.envDetail',
    'Clean — no Anthropic values in registry': 'readiness.raw.registryClean',
    'Anthropic values found in registry': 'readiness.raw.registryDetected',
    'Registry entries could interfere with runtime.': 'readiness.raw.registryDetail',
    'Clean — settings.json env section is empty': 'readiness.raw.settingsClean',
    'settings.json env section has entries': 'readiness.raw.settingsDetected',
    'Verified': 'readiness.raw.verified',
    'Build status unknown — run diagnostics': 'readiness.raw.buildUnknown',
    'Restored from local storage': 'readiness.raw.capsuleRestored',
    'Using safe default': 'readiness.raw.capsuleDefault',
    'Load error — using fallback': 'readiness.raw.capsuleFallback',
    'Capsule could not be restored. Project context may be incomplete.': 'readiness.raw.capsuleDetail',
    '为空': 'diag.sEmpty'
  }
  return keys[text] ? t(keys[text]) : text
}

export default function ReadyCheckPanel() {
  const { t } = useLocale()
  const [result, setResult] = useState<ReadinessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [diag, capsuleResult] = await Promise.all([
        window.api.diagnostics.run(), window.api.capsule.load()
      ])
      const res = evaluateReadiness(diag as DiagnosticReport, capsuleResult.capsule, capsuleResult.source)
      setResult(res)
    } catch (e) {
      setError(true)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { run() }, [run])

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg border p-4"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <div className="mb-2 h-4 w-1/3 rounded" style={{ background: 'var(--bg-tertiary)' }} />
        <div className="mb-3 h-3 w-2/3 rounded" style={{ background: 'var(--bg-tertiary)' }} />
        <div className="space-y-2">{['1','2','3','4'].map(i => <div key={i} className="h-3 w-full rounded" style={{ background: 'var(--bg-tertiary)' }} />)}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border p-4"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--warn)' }}>
        <div className="mb-2 flex items-center gap-2">
          <span style={{ color: 'var(--warn)' }}>{'⚠'}</span>
          <p className="text-xs" style={{ color: 'var(--warn)' }}>{t('readiness.error')}</p>
        </div>
        <button onClick={run}
          className="rounded px-2 py-1 text-[10px] transition-colors hover:opacity-90"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{t('editor.retry')}</button>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{'🔍'}</span>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('readiness.title')}</h3>
        </div>
        <button onClick={run} className="text-[10px] transition-colors hover:opacity-80" title={t('readiness.recheck')}
          style={{ color: 'var(--accent)' }}>{'↻'} {t('readiness.recheck')}</button>
      </div>

      <div className="border-b px-4 py-2.5" style={verdictStyle(result.verdict)}>
        <p className="text-xs font-semibold">
          {result.verdict === 'ready' ? '✓' : result.verdict === 'almost-ready' ? '⚠' : result.verdict === 'not-ready' ? '✗' : '—'}
          {' '}{verdictLabel(result.verdict, t)}
        </p>
        <p className="mt-0.5 text-[10px] opacity-70" style={{ color: 'inherit' }}>
          {result.okCount}{t('readiness.okCount')}, {result.warnCount}{t('readiness.warnCount')}, {result.errorCount}{t('readiness.errCount')}{result.unknownCount > 0 ? `, ${result.unknownCount}${t('readiness.unknownCount')}` : ''}
        </p>
      </div>

      <div className="space-y-1.5 px-4 py-3">
        {result.checks.map(check => (
          <div key={check.id} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 w-4 flex-shrink-0 text-center" style={{ color: statusColor(check.status) }}>{statusIcon(check.status)}</span>
            <div className="min-w-0">
              <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{localizeReadinessText(check.label, t)}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{' — '}{localizeReadinessText(check.summary, t)}</span>
              {check.detail && <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{localizeReadinessText(check.detail, t)}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t px-4 py-2"
        style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{t('readiness.footer')}</p>
      </div>
    </div>
  )
}
