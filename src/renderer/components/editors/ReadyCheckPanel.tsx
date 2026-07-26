import { useState, useEffect, useCallback } from 'react'
import type { DiagnosticReport } from '../../../shared/ipc-types'
import { evaluateReadiness, type ReadinessResult, type CheckStatus } from '../../lib/readiness-rules'
import { useLocale } from '../../contexts/LocaleContext'

function statusIcon(s: CheckStatus): string {
  if (s === 'ok') return '✓'
  if (s === 'warn') return '⚠'
  if (s === 'error') return '✗'
  return '—'
}

function statusColor(s: CheckStatus): string {
  if (s === 'ok') return 'text-green-400'
  if (s === 'warn') return 'text-yellow-400'
  if (s === 'error') return 'text-red-400'
  return 'text-gray-500'
}

function verdictLabel(v: string, t: (k: string) => string): string {
  if (v === 'ready') return t('readiness.ready')
  if (v === 'almost-ready') return t('readiness.almostReady')
  if (v === 'not-ready') return t('readiness.notReady')
  return t('readiness.checking')
}

function verdictColor(v: string): string {
  if (v === 'ready') return 'border-green-800 bg-green-950/40 text-green-300'
  if (v === 'almost-ready') return 'border-yellow-800 bg-yellow-950/40 text-yellow-300'
  if (v === 'not-ready') return 'border-red-800 bg-red-950/40 text-red-300'
  return 'border-gray-800 bg-gray-950/40 text-gray-400'
}

function localizeReadinessText(text: string | undefined, t: (k: string) => string): string {
  if (!text) return ''
  const keys: Record<string, string> = {
    'Environment variables': 'readiness.raw.environmentVariables',
    'Windows Registry': 'readiness.raw.windowsRegistry',
    'Settings env': 'readiness.raw.settingsEnv',
    'API key configured': 'readiness.raw.apiKeyConfigured',
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
    'Configured but uses legacy storage — migration recommended': 'readiness.raw.apiLegacy',
    'Configured with secure storage': 'readiness.raw.apiSecure',
    'Not configured — set up API key in Settings': 'readiness.raw.apiMissing',
    'Open Settings to configure a provider and API key.': 'readiness.raw.apiDetail',
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
      const [diag, apiConfig, capsuleResult] = await Promise.all([
        window.api.diagnostics.run(), window.api.api.loadConfig(), window.api.capsule.load()
      ])
      const res = evaluateReadiness(diag as DiagnosticReport, { hasKey: apiConfig.hasKey, hasLegacyKey: apiConfig.hasLegacyKey }, capsuleResult.capsule, capsuleResult.source)
      setResult(res)
    } catch (e) {
      setError(true)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { run() }, [run])

  if (loading) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-2" />
        <div className="h-3 bg-gray-800 rounded w-2/3 mb-3" />
        <div className="space-y-2">{['1','2','3','4'].map(i => <div key={i} className="h-3 bg-gray-800 rounded w-full" />)}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-900/60 border border-yellow-900/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2"><span className="text-yellow-400">{'⚠'}</span><p className="text-xs text-yellow-300">{t('readiness.error')}</p></div>
        <button onClick={run} className="text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">{t('editor.retry')}</button>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{'🔍'}</span>
          <h3 className="text-sm font-semibold text-gray-200">{t('readiness.title')}</h3>
        </div>
        <button onClick={run} className="text-[10px] text-indigo-400 hover:text-indigo-300" title={t('readiness.recheck')}>{'↻'} {t('readiness.recheck')}</button>
      </div>

      <div className={`px-4 py-2.5 border-b ${verdictColor(result.verdict)}`}>
        <p className="text-xs font-semibold">
          {result.verdict === 'ready' ? '✓' : result.verdict === 'almost-ready' ? '⚠' : result.verdict === 'not-ready' ? '✗' : '—'}
          {' '}{verdictLabel(result.verdict, t)}
        </p>
        <p className="text-[10px] mt-0.5 opacity-70">
          {result.okCount}{t('readiness.okCount')}, {result.warnCount}{t('readiness.warnCount')}, {result.errorCount}{t('readiness.errCount')}{result.unknownCount > 0 ? `, ${result.unknownCount}${t('readiness.unknownCount')}` : ''}
        </p>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {result.checks.map(check => (
          <div key={check.id} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 w-4 text-center flex-shrink-0 ${statusColor(check.status)}`}>{statusIcon(check.status)}</span>
            <div className="min-w-0"><span className="text-gray-300 font-medium">{localizeReadinessText(check.label, t)}</span><span className="text-gray-500">{' — '}{localizeReadinessText(check.summary, t)}</span>
              {check.detail && <p className="text-[10px] text-gray-600 mt-0.5">{localizeReadinessText(check.detail, t)}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 bg-gray-950/60 border-t border-gray-800">
        <p className="text-[9px] text-gray-600 leading-relaxed">{t('readiness.footer')}</p>
      </div>
    </div>
  )
}
