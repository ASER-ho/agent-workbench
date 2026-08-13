import { useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import { useObservation } from '../../contexts/ObservationContext'
import type {
  AutoVerificationRevocationReason,
  HookHealthState,
  HookPreviewResult,
  ObservedSession
} from '../../../shared/observation-types'

export default function ObservationPanel() {
  const { t } = useLocale()
  const obs = useObservation()
  const [preview, setPreview] = useState<HookPreviewResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const status = obs.status
  const sessions = obs.sessions
  const autoVerify = status?.autoVerify ?? { autoVerifyEnabled: false, workspaceOnly: true, recipeIds: [], authorization: null }
  const authorization = autoVerify.authorization ?? null

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try { await action() } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }

  const beginHookChange = async (): Promise<void> => {
    await run(async () => {
      const next = await obs.installHooksPreview()
      if (!next.ok) throw new Error(next.reason ?? t('observation.actionFailed'))
      setPreview(next)
    })
  }

  const confirmHookChange = async (): Promise<void> => {
    await run(async () => {
      const result = await obs.confirmInstallHooks()
      if (!result.ok) throw new Error(result.reason ?? t('observation.actionFailed'))
      setPreview(null)
      setNotice(t('observation.hooksInstalled'))
    })
  }

  const restartObservation = async (): Promise<void> => {
    await run(async () => {
      if (status?.enabled) await obs.disable()
      await obs.enable()
    })
  }

  const hookAction = (): { label: string; action: () => Promise<void> } | null => {
    switch (status?.hookHealth.state) {
      case 'NOT_INSTALLED': return { label: t('observation.installHooks'), action: beginHookChange }
      case 'INSTALLED_DRIFTED': return { label: t('observation.repairHooks'), action: beginHookChange }
      case 'SERVER_UNAVAILABLE':
      case 'WATCHER_ERROR': return { label: t('observation.restart'), action: restartObservation }
      case 'INSTALLED_HEALTHY': return {
        label: t('observation.uninstallHooks'),
        action: async () => { await run(async () => { await obs.uninstallHooks(); setNotice(t('observation.hooksRemoved')) }) }
      }
      default: return null
    }
  }

  const currentHookAction = hookAction()

  const statusLabel = (sessionStatus: ObservedSession['status']): string => {
    const key: Record<ObservedSession['status'], string> = {
      idle: t('observation.status.idle'), thinking: t('observation.status.thinking'),
      working: t('observation.status.working'), attention: t('observation.status.attention'),
      sleeping: t('observation.status.sleeping'), error: t('observation.status.error'), ended: t('observation.status.ended')
    }
    return key[sessionStatus]
  }

  const hookLabel = (state: HookHealthState | undefined): string => state
    ? t(`observation.hookHealth.${state}`)
    : t('observation.hookHealth.NOT_INSTALLED')

  const revocationLabel = (reason: AutoVerificationRevocationReason | null): string => reason
    ? t(`observation.revocation.${reason}`)
    : ''

  return (
    <div className="rounded-lg border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('observation.title')}</h3>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{t('observation.desc')}</p>
        </div>
        <button disabled={busy} onClick={() => void run(status?.enabled ? obs.disable : obs.enable)}
          className="shrink-0 rounded px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
          style={{ background: status?.enabled ? 'var(--verified-soft)' : 'var(--bg-tertiary)', color: status?.enabled ? 'var(--verified)' : 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
          {status?.enabled ? t('observation.disable') : t('observation.enable')}
        </button>
      </div>

      <section className="mt-4 rounded border p-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-primary)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('observation.healthTitle')}</p>
            <p className="mt-1 text-xs" style={{ color: status?.hookHealth.state === 'INSTALLED_HEALTHY' ? 'var(--verified)' : 'var(--text-secondary)' }}>
              {hookLabel(status?.hookHealth.state)}
            </p>
          </div>
          {currentHookAction && <button disabled={busy} onClick={() => void currentHookAction.action()}
            className="rounded px-2.5 py-1.5 text-xs disabled:opacity-50"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
            {currentHookAction.label}
          </button>}
        </div>
        {status?.enabled && <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {t('observation.watchDirs')}: {status.watchedDirs.claudeProjects}, {status.watchedDirs.codexSessions}
        </p>}
        {status?.hookHealth.reason && <div className="mt-2 rounded p-2 text-xs" style={{ color: 'var(--warn)', background: 'var(--warn-soft)' }}>
          <p>{t(`observation.healthReason.${status.hookHealth.state}`)}</p>
          <p className="mt-1">{t('observation.nextAction')}: {currentHookAction?.label ?? t('observation.none')}</p>
        </div>}
      </section>

      {(status?.lastError || actionError) && <div className="mt-3 rounded p-2 text-xs" style={{ color: 'var(--failed)', background: 'var(--failed-soft)' }}>
        {t('observation.lastError')}: {actionError ?? status?.lastError}
      </div>}
      {notice && <p className="mt-2 text-xs" style={{ color: 'var(--verified)' }}>{notice}</p>}

      <section className="mt-4">
        <h4 className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('observation.sessions')}</h4>
        {sessions.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('observation.noSessions')}</p> : (
          <ul className="space-y-1.5">
            {sessions.map((session) => <li key={`${session.agentKind}:${session.sessionId}`} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: statusColor(session.status) }} />
              <span style={{ color: 'var(--text-primary)' }}>{t(`observation.agent.${session.agentKind}`)}</span>
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{session.displayPath}</span>
              <span className="ml-auto shrink-0" style={{ color: 'var(--text-tertiary)' }}>{statusLabel(session.status)} / {session.eventCount}</span>
            </li>)}
          </ul>
        )}
      </section>

      {preview && <section className="mt-4 rounded border p-3" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--warn)' }}>{t('observation.installPreviewTitle')}</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('observation.installPreviewTarget')}: {preview.targetPath || '-'} · {t('observation.installPreviewBackup')}: {preview.backupPath || '-'}
        </p>
        <pre className="mt-2 max-h-40 overflow-auto rounded p-2 text-[11px] whitespace-pre-wrap" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{preview.previewJson}</pre>
        <div className="mt-2 flex gap-2">
          <button disabled={busy} onClick={() => void confirmHookChange()} className="rounded px-2.5 py-1.5 text-xs disabled:opacity-50" style={{ background: 'var(--verified)', color: 'white' }}>{t('observation.installPreviewConfirm')}</button>
          <button onClick={() => setPreview(null)} className="rounded px-2.5 py-1.5 text-xs" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{t('observation.installPreviewCancel')}</button>
        </div>
      </section>}

      <section className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('observation.autoVerify')}</h4>
            <p className="mt-1 text-xs" style={{ color: authorization?.state === 'AUTHORIZED' ? 'var(--verified)' : 'var(--text-tertiary)' }}>
              {authorization?.state === 'AUTHORIZED' ? t('observation.authorizationActive') : t('observation.authorizationOff')}
            </p>
          </div>
          {authorization?.state === 'AUTHORIZED' ? (
            <button disabled={busy} onClick={() => void run(() => obs.setAutoVerify({ autoVerifyEnabled: false, workspaceOnly: true, recipeIds: [] }))}
              className="rounded px-2.5 py-1.5 text-xs disabled:opacity-50" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{t('observation.revoke')}</button>
          ) : (
            <button disabled={busy || !status?.enabled} onClick={() => void run(() => obs.setAutoVerify({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds: ['project-default-check'] }))}
              className="rounded px-2.5 py-1.5 text-xs disabled:opacity-50" style={{ background: 'var(--verified)', color: 'white' }}>{t('observation.armOnce')}</button>
          )}
        </div>

        {authorization && <div className="mt-2 grid gap-1 rounded p-2 text-xs" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
          <p>{t('observation.workspace')}: {authorization.workspaceDisplayId}</p>
          <p>{t('observation.recipe')}: {authorization.recipeLabels.join(', ')}</p>
          <p>{t('observation.contract')}: {authorization.contractDigestPrefix}</p>
          <p>{t('observation.trigger')}: {t('observation.triggerSessionEnd')}</p>
          {authorization.state === 'AUTHORIZED' && <p style={{ color: 'var(--warn)' }}>{t('observation.singleUse')}</p>}
          {authorization.state === 'REVOKED' && <p style={{ color: 'var(--warn)' }}>{t('observation.authorizationRevoked')}: {revocationLabel(authorization.reason)}</p>}
          {authorization.state === 'CONSUMED' && <p style={{ color: 'var(--verified)' }}>{t('observation.authorizationConsumed')}</p>}
        </div>}

        {!authorization && <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('observation.noContract')}</p>}
        {status?.auditHealth.state === 'DEGRADED' && <div className="mt-2 rounded p-2 text-xs" style={{ background: 'var(--failed-soft)', color: 'var(--failed)' }}>
          {t('observation.auditDegraded')}: {status.auditHealth.error}
        </div>}
        {obs.lastReceipt && <p className="mt-2 text-xs" style={{ color: 'var(--verified)' }}>
          {t('observation.lastReceipt')}: {obs.lastReceipt.trigger === 'auto:session-end' ? t('observation.lastReceiptAuto') : t('observation.lastReceiptManual')}
        </p>}
      </section>
    </div>
  )
}

function statusColor(status: ObservedSession['status']): string {
  switch (status) {
    case 'working': return 'var(--verified)'
    case 'thinking': return 'var(--warn)'
    case 'error': return 'var(--failed)'
    case 'ended': return 'var(--text-tertiary)'
    default: return 'var(--text-secondary)'
  }
}
