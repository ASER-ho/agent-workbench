import { useEffect, useMemo, useState } from 'react'
import type { VerificationContract, VerificationInspection } from '../../../shared/verification-types'
import { useLocale } from '../../contexts/LocaleContext'

type WorkspaceStatus = Awaited<ReturnType<typeof window.api.workspaceSelection.getStatus>>

const DEFAULT_CONTRACT: VerificationContract = {
  title: '',
  goal: '',
  allowedPaths: ['src'],
  forbiddenPaths: ['.git'],
  acceptanceCriteria: ['所有当前修改都已分类'],
  knownRisks: ['尚未运行功能验证命令']
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
}

function lineValue(value: string[]): string {
  return value.join('\n')
}

export default function VerificationWorkbench() {
  const { t } = useLocale()
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null)
  const [contract, setContract] = useState(DEFAULT_CONTRACT)
  const [result, setResult] = useState<VerificationInspection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    window.api.workspaceSelection.getStatus()
      .then(status => { if (active) setWorkspace(status) })
      .catch(() => { if (active) setWorkspace(null) })
    return () => { active = false }
  }, [])

  const ready = useMemo(() => Boolean(
    workspace?.selected && contract.title.trim() && contract.goal.trim() &&
    contract.allowedPaths.length && contract.acceptanceCriteria.length && contract.knownRisks.length
  ), [workspace, contract])

  const chooseWorkspace = async () => {
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const response = await window.api.workspaceSelection.choose()
      setWorkspace(response.status)
    } catch {
      setError(t('verification.workspaceFailed'))
    } finally {
      setBusy(false)
    }
  }

  const inspect = async () => {
    if (!ready) return
    setError('')
    setResult(null)
    setBusy(true)
    try {
      setResult(await window.api.verification.inspect(contract))
    } catch {
      setError(t('verification.inspectFailed'))
    } finally {
      setBusy(false)
    }
  }

  const fieldClass = 'w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500'

  return (
    <section className="w-full rounded-xl border border-gray-800 bg-gray-900/70 p-5 text-gray-300" aria-labelledby="verification-heading">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="verification-heading" className="text-lg font-semibold text-gray-100">{t('verification.title')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('verification.subtitle')}</p>
        </div>
        <span className="rounded-full border border-emerald-800/70 bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-300">{t('verification.readOnly')}</span>
      </div>

      <div className="mb-4 rounded-lg border border-gray-800 bg-gray-950/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-gray-600">{t('verification.workspace')}</div>
            <div className="truncate text-sm text-gray-300">{workspace?.selected ? workspace.displayName : t('verification.workspaceMissing')}</div>
          </div>
          <button type="button" onClick={chooseWorkspace} disabled={busy} className="rounded-md border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:border-gray-500 disabled:opacity-50">
            {busy ? t('verification.choosing') : t('verification.chooseWorkspace')}
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1 text-xs text-gray-500">
          {t('verification.taskTitle')}
          <input className={fieldClass} value={contract.title} onChange={event => setContract(current => ({ ...current, title: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500">
          {t('verification.goal')}
          <textarea className={fieldClass} rows={2} value={contract.goal} onChange={event => setContract(current => ({ ...current, goal: event.target.value }))} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-gray-500">
            {t('verification.allowedPaths')}
            <textarea className={fieldClass} rows={3} value={lineValue(contract.allowedPaths)} onChange={event => setContract(current => ({ ...current, allowedPaths: lines(event.target.value) }))} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500">
            {t('verification.forbiddenPaths')}
            <textarea className={fieldClass} rows={3} value={lineValue(contract.forbiddenPaths)} onChange={event => setContract(current => ({ ...current, forbiddenPaths: lines(event.target.value) }))} />
          </label>
        </div>
        <label className="grid gap-1 text-xs text-gray-500">
          {t('verification.acceptanceCriteria')}
          <textarea className={fieldClass} rows={2} value={lineValue(contract.acceptanceCriteria)} onChange={event => setContract(current => ({ ...current, acceptanceCriteria: lines(event.target.value) }))} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500">
          {t('verification.knownRisks')}
          <textarea className={fieldClass} rows={2} value={lineValue(contract.knownRisks)} onChange={event => setContract(current => ({ ...current, knownRisks: lines(event.target.value) }))} />
        </label>
      </div>

      <p className="mt-3 text-xs text-amber-300/80">{t('verification.noCommand')}</p>
      {error && <p role="alert" className="mt-3 rounded-md border border-red-900/70 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
      <button type="button" onClick={inspect} disabled={!ready || busy} className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? t('verification.inspecting') : t('verification.inspect')}
      </button>

      {result && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <div className={`rounded-lg border p-3 ${result.scopeCompliant ? 'border-emerald-800/70 bg-emerald-950/30' : 'border-amber-800/70 bg-amber-950/30'}`}>
            <div className={`text-sm font-medium ${result.scopeCompliant ? 'text-emerald-300' : 'text-amber-300'}`}>
              {t(result.scopeCompliant ? 'verification.scopeCompliant' : 'verification.scopeProblem')}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-400">
              <span>{t('verification.changedCount')}: {result.changedCount}</span>
              <span>{t('verification.unexpectedCount')}: {result.unexpectedCount}</span>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{t('verification.changedFiles')}</h3>
            {result.changes.length === 0 ? (
              <p className="text-xs text-gray-600">{t('verification.noChanges')}</p>
            ) : (
              <ul className="space-y-1">
                {result.changes.map((change, index) => (
                  <li key={`${change.path}-${index}`} className="flex items-center justify-between gap-3 rounded bg-gray-950/70 px-3 py-2 text-xs">
                    <code className="min-w-0 truncate text-gray-300">{change.path}</code>
                    <span className="shrink-0 text-gray-500">{t(`verification.class.${change.classification}`)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{t('verification.receipt')}</h3>
            <div className="space-y-2">
              {result.receipt.sections.map(section => (
                <div key={section.id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
                  <div className="text-xs font-medium text-gray-300">{section.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{section.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
