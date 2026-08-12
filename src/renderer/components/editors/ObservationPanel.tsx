import { useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import { useObservation } from '../../contexts/ObservationContext'
import type { ObservedSession, HookPreviewResult } from '../../../shared/observation-types'

export default function ObservationPanel() {
  const { t } = useLocale()
  const obs = useObservation()
  const [preview, setPreview] = useState<HookPreviewResult | null>(null)
  const [hookResult, setHookResult] = useState<string | null>(null)

  const status = obs.status
  const sessions = obs.sessions
  const autoVerify = status?.autoVerify ?? { autoVerifyEnabled: false, workspaceOnly: true, recipeIds: ['project-default-check'] }

  const beginInstall = async () => {
    const p = await obs.installHooksPreview()
    setPreview(p)
  }

  const confirmInstall = async () => {
    const r = await obs.confirmInstallHooks()
    setPreview(null)
    setHookResult(r.ok ? t('observation.hooksInstalled') : (r.reason ?? t('observation.installPreviewCancel')))
  }

  const statusLabel = (s: ObservedSession['status']): string => {
    const key: Record<string, string> = {
      idle: t('observation.status.idle'), thinking: t('observation.status.thinking'),
      working: t('observation.status.working'), attention: t('observation.status.attention'),
      sleeping: t('observation.status.sleeping'), error: t('observation.status.error'), ended: t('observation.status.ended')
    }
    return key[s] ?? s
  }

  const agentLabel = (s: ObservedSession): string => t('observation.agent.' + s.agentKind)

  return (
    <div className="rounded-lg border p-4"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('observation.title')}</h3>
          <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{t('observation.desc')}</p>
        </div>
        <button
          onClick={() => { void (status?.enabled ? obs.disable() : obs.enable()) }}
          className="rounded px-3 py-1 text-[11px] transition-colors"
          style={{ background: status?.enabled ? 'var(--verified-soft)' : 'var(--bg-tertiary)', color: status?.enabled ? 'var(--verified)' : 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
        >
          {status?.enabled ? t('observation.disable') : t('observation.enable')}
        </button>
      </div>

      {status?.enabled && (
        <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {t('observation.watchDirs')}: {status.watchedDirs.claudeProjects}, {status.watchedDirs.codexSessions}
        </p>
      )}

      {status?.lastError && (
        <p className="mt-2 text-[10px]" style={{ color: 'var(--failed)' }}>{t('observation.lastError')}: {status.lastError}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {status?.hooksInstalled ? t('observation.hooksInstalled') : t('observation.hooksNotInstalled')}
        </span>
        {!status?.hooksInstalled ? (
          <button onClick={() => void beginInstall()} className="rounded px-2 py-0.5 text-[10px] transition-colors hover:opacity-90"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
            {t('observation.installHooks')}
          </button>
        ) : (
          <button onClick={() => void obs.uninstallHooks()} className="rounded px-2 py-0.5 text-[10px] transition-colors hover:opacity-90"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
            {t('observation.uninstallHooks')}
          </button>
        )}
      </div>
      {hookResult && <p className="mt-1 text-[10px]" style={{ color: 'var(--verified)' }}>{hookResult}</p>}

      <div className="mt-3">
        <h4 className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{t('observation.sessions')}</h4>
        {sessions.length === 0 ? (
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{t('observation.noSessions')}</p>
        ) : (
          <ul className="space-y-1">
            {sessions.map(s => (
              <li key={s.agentKind + ':' + s.sessionId} className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full" style={{ background: statusColor(s.status) }} />
                <span style={{ color: 'var(--text-primary)' }}>{agentLabel(s)}</span>
                <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{s.displayPath}</span>
                <span className="ml-auto shrink-0" style={{ color: 'var(--text-tertiary)' }}>{statusLabel(s.status)} / {s.eventCount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview && (
        <div className="mt-3 rounded border p-3" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
          <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--warn)' }}>{t('observation.installPreviewTitle')}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {t('observation.installPreviewTarget')}: {preview.targetPath || '-'}{' | '}{t('observation.installPreviewBackup')}: {preview.backupPath || '-'}
          </p>
          <pre className="mt-2 max-h-40 overflow-auto rounded p-2 text-[9px] whitespace-pre-wrap"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{preview.previewJson}</pre>
          <div className="mt-2 flex gap-2">
            <button onClick={() => void confirmInstall()} className="rounded px-2 py-1 text-[10px]"
              style={{ background: 'var(--verified)', color: 'white' }}>{t('observation.installPreviewConfirm')}</button>
            <button onClick={() => setPreview(null)} className="rounded px-2 py-1 text-[10px]"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{t('observation.installPreviewCancel')}</button>
          </div>
        </div>
      )}

      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-color)' }}>
        <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={autoVerify.autoVerifyEnabled}
            onChange={(e) => void obs.setAutoVerify({ autoVerifyEnabled: e.target.checked, workspaceOnly: true, recipeIds: ['project-default-check'] })} />
          {t('observation.autoVerifyEnabled')}
        </label>
        {obs.lastReceipt ? (
          <p className="mt-1 text-[10px]" style={{ color: 'var(--verified)' }}>
            {t('observation.lastReceipt')}: {obs.lastReceipt.trigger === 'auto:session-end' ? t('observation.lastReceiptAuto') : t('observation.lastReceiptManual')}
          </p>
        ) : (
          <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{t('observation.noContract')}</p>
        )}
      </div>
    </div>
  )
}

function statusColor(s: ObservedSession['status']): string {
  switch (s) {
    case 'working': return 'var(--verified)'
    case 'thinking': return 'var(--warn)'
    case 'error': return 'var(--failed)'
    case 'ended': return 'var(--text-tertiary)'
    default: return 'var(--text-secondary)'
  }
}
