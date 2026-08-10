import { useState, useEffect, useCallback } from 'react'
import type { DiagnosticReport } from '../../../shared/ipc-types'
import { evaluateReadiness, type ReadinessResult } from '../../lib/readiness-rules'
import { useLocale } from '../../contexts/LocaleContext'

function statusIcon(ok: boolean | undefined): string { if (ok === true) return '✓'; if (ok === false) return '✗'; return '—' }
function statusColor(ok: boolean | undefined): string { if (ok === true) return 'text-green-400'; if (ok === false) return 'text-red-400'; return 'text-gray-500' }

export default function LaunchConfirmation() {
  const { t } = useLocale()
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [providerMode, setProviderMode] = useState<'default' | 'custom'>('default')
  const [workspaceLabel, setWorkspaceLabel] = useState<string>('')
  const [workspaceSelected, setWorkspaceSelected] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [diag, capsuleResult, runtimeStatus] = await Promise.all([
        window.api.diagnostics.run(), window.api.capsule.load(), window.api.runtime.getStatus()
      ])
      const res = evaluateReadiness(diag as DiagnosticReport, capsuleResult.capsule, capsuleResult.source)
      setReadiness(res)
      setProviderMode(runtimeStatus.mode === 'custom' ? 'custom' : 'default')
      setWorkspaceLabel(capsuleResult.capsule.workspaceLabel ?? '')
      setWorkspaceSelected(Boolean(capsuleResult.capsule.safetyState?.workspaceSelected))
    } catch { /* silently use defaults */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const displayedProviderMode = t(providerMode === 'custom' ? 'capsule.provider.custom' : 'launch.providerDefault')
  const displayedWorkspaceLabel = workspaceLabel === 'Current Workspace'
    ? t('sidebar.currentWorkspace')
    : workspaceLabel || t('launch.notSelected')

  const checks = [
    { label: t('launch.checkEnvReadiness'), ok: readiness?.verdict === 'ready', detail: readiness ? `${readiness.okCount}${t('readiness.okCount')}, ${readiness.warnCount}${t('readiness.warnCount')}, ${readiness.errorCount}${t('readiness.errCount')}` : t('readiness.checking') },
    { label: t('launch.checkClaude'), ok: readiness?.checks.find(c => c.id === 'claude')?.status === 'ok', detail: t('launch.required') },
    { label: t('launch.checkApiKey'), ok: readiness?.checks.find(c => c.id === 'api-config')?.status === 'ok', detail: t('launch.secureRecommended') },
    { label: t('launch.checkEnvClean'), ok: readiness?.checks.find(c => c.id === 'env')?.status === 'ok', detail: t('launch.noConflictingEnv') },
    { label: t('launch.checkWorkspace'), ok: workspaceSelected, detail: workspaceSelected ? `${t('launch.currentProvider')}${displayedWorkspaceLabel}` : t('launch.chooseBeforeLaunch') },
    { label: t('launch.checkProvider'), ok: true, detail: `${t('launch.currentProvider')}${displayedProviderMode}` }
  ]

  const allReady = checks.every(c => c.ok)

  if (loading) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-2" /><div className="h-3 bg-gray-800 rounded w-2/3 mb-3" />
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-3 bg-gray-800 rounded w-full" />)}</div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{'🚀'}</span>
          <h3 className="text-sm font-semibold text-gray-200">{t('launch.title')}</h3>
          <span className="text-[10px] text-yellow-500/80 bg-yellow-950/40 px-1.5 py-0.5 rounded">{t('launch.planned')}</span>
        </div>
        <span className="text-[10px] text-gray-600">{t('launch.phase')}</span>
      </div>

      <div className="px-4 py-2.5 bg-yellow-950/20 border-b border-yellow-900/30">
        <p className="text-xs text-yellow-300/80 font-medium">{'⚠'} {t('launch.notAvailable')}</p>
        <p className="text-[10px] text-yellow-400/60 mt-0.5">{t('launch.notAvailableDetail')}</p>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><span className="text-gray-600">{t('launch.workspace')}</span><p className="text-gray-300 font-medium truncate">{displayedWorkspaceLabel}</p></div>
          <div><span className="text-gray-600">{t('launch.provider')}</span><p className="text-gray-300 font-medium">{displayedProviderMode}</p></div>
          <div><span className="text-gray-600">{t('launch.readiness')}</span><p className={`font-medium ${readiness?.verdict === 'ready' ? 'text-green-400' : readiness?.verdict === 'almost-ready' ? 'text-yellow-400' : 'text-red-400'}`}>{readiness?.verdict === 'ready' ? t('launch.ready') : readiness?.verdict === 'almost-ready' ? t('launch.almost') : t('launch.notReady')}</p></div>
        </div>

        <div className="border-t border-gray-800 pt-2">
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{'✅'} {t('launch.checklistTitle')}</h4>
          <div className="space-y-1.5">
            {checks.map(check => (
              <div key={check.label} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 w-4 text-center flex-shrink-0 ${statusColor(check.ok)}`}>{statusIcon(check.ok)}</span>
                <div className="min-w-0"><span className={check.ok ? 'text-gray-300' : 'text-gray-500'}>{check.label}</span>{check.detail && <span className="text-gray-600">{' — '}{check.detail}</span>}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-800 pt-2">
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{'⚠'} {t('launch.riskTitle')}</h4>
          <ul className="text-[10px] text-gray-500 space-y-0.5 list-disc list-inside">
            <li>{t('launch.riskAccess')}</li><li>{t('launch.riskModify')}</li><li>{t('launch.riskStop')}</li><li>{t('launch.riskLocal')}</li><li>{t('launch.riskConfirm')}</li>
          </ul>
        </div>

        <div className="border-t border-gray-800 pt-2">
          <button disabled className="w-full text-xs px-4 py-2 bg-gray-800 border border-gray-700 text-gray-500 rounded cursor-not-allowed flex items-center justify-center gap-2" title={t('launch.notAvailable')}>
            <span>{'🔒'}</span>{t('launch.buttonDisabled')}
          </button>
          <p className="text-[9px] text-gray-700 text-center mt-1.5">{allReady ? t('launch.buttonHintReady') : t('launch.buttonHintNotReady')}</p>
        </div>
      </div>

      <div className="px-4 py-2 bg-gray-950/60 border-t border-gray-800">
        <p className="text-[9px] text-gray-600 leading-relaxed">{t('launch.footer')}</p>
      </div>
    </div>
  )
}
