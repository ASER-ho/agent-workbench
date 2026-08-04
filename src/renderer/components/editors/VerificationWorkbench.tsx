import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VerificationContract, VerificationInspection } from '../../../shared/verification-types'
import type {
  ControlledVerificationPreview,
  ControlledVerificationResult
} from '../../../shared/controlled-verification-execution-types'
import { useLocale } from '../../contexts/LocaleContext'
import { createInspectionGuard, sameWorkspace } from './inspection-guard'

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
  const [testPath, setTestPath] = useState('test/example.test.mjs')
  const [preview, setPreview] = useState<ControlledVerificationPreview | null>(null)
  const [cvResult, setCvResult] = useState<ControlledVerificationResult | null>(null)
  const [cvBusy, setCvBusy] = useState(false)
  const [cvError, setCvError] = useState('')
  const guardRef = useRef(createInspectionGuard())
  // 工作区身份以 ref 跟踪，比较在 updater 之外进行，避免 updater 内部副作用
  const workspaceRef = useRef<WorkspaceStatus | null>(null)

  const invalidate = useCallback(() => {
    guardRef.current.invalidate()
    setResult(null)
    setBusy(false)
    setPreview(null)
    setCvResult(null)
    setCvError('')
    setCvBusy(false)
  }, [])

  const setContractField = useCallback(<K extends keyof VerificationContract>(key: K, value: VerificationContract[K]) => {
    invalidate()
    setContract(current => ({ ...current, [key]: value }))
  }, [invalidate])

  const applyWorkspace = useCallback((status: WorkspaceStatus) => {
    if (!sameWorkspace(workspaceRef.current, status)) invalidate()
    workspaceRef.current = status
    setWorkspace(status)
  }, [invalidate])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const status = await window.api.workspaceSelection.getStatus()
        if (!active) return
        applyWorkspace(status)
      } catch {
        if (!active) return
        invalidate()
        setWorkspace(null)
      }
    }
    void refresh()
    const unsubscribe = window.api.workspaceSelection.onChanged(status => {
      if (!active) return
      applyWorkspace(status)
    })
    const onFocus = () => { void refresh() }
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [applyWorkspace, invalidate])

  const ready = useMemo(() => Boolean(
    workspace?.selected && contract.title.trim() && contract.goal.trim() &&
    contract.allowedPaths.length && contract.acceptanceCriteria.length && contract.knownRisks.length
  ), [workspace, contract])

  const previewReady = useMemo(() => Boolean(ready && testPath.trim()), [ready, testPath])

  const chooseWorkspace = async () => {
    setError('')
    setBusy(true)
    try {
      const response = await window.api.workspaceSelection.choose()
      if (response.status.selected) applyWorkspace(response.status)
    } catch {
      setError(t('verification.workspaceFailed'))
      setBusy(false)
    }
  }

  const inspect = async () => {
    if (!ready) return
    setError('')
    let freshWorkspace: WorkspaceStatus | null = null
    try {
      freshWorkspace = await window.api.workspaceSelection.getStatus()
    } catch {
      invalidate()
      setError(t('verification.workspaceFailed'))
      return
    }
    if (!freshWorkspace?.selected || freshWorkspace.displayId !== workspaceRef.current?.displayId) {
      applyWorkspace(freshWorkspace)
      setError(t('verification.workspaceFailed'))
      return
    }
    const requestId = guardRef.current.begin()
    setBusy(true)
    try {
      const next = await window.api.verification.inspect(contract)
      if (!guardRef.current.shouldAccept(requestId)) return
      setResult(next)
    } catch {
      if (guardRef.current.shouldAccept(requestId)) {
        setError(t('verification.inspectFailed'))
      }
    } finally {
      if (guardRef.current.shouldAccept(requestId)) {
        setBusy(false)
      }
    }
  }

  const generatePreview = async () => {
    if (!previewReady) return
    setCvError('')
    let freshWorkspace: WorkspaceStatus | null = null
    try {
      freshWorkspace = await window.api.workspaceSelection.getStatus()
    } catch {
      invalidate()
      setCvError(t('verification.workspaceFailed'))
      return
    }
    if (!freshWorkspace?.selected || freshWorkspace.displayId !== workspaceRef.current?.displayId) {
      applyWorkspace(freshWorkspace)
      setCvError(t('verification.workspaceFailed'))
      return
    }
    const requestId = guardRef.current.begin()
    setCvBusy(true)
    try {
      const next = await window.api.controlledVerification.preview({ testPath: testPath.trim(), contract })
      if (!guardRef.current.shouldAccept(requestId)) return
      setPreview(next)
      setCvResult(null)
    } catch (err) {
      if (guardRef.current.shouldAccept(requestId)) {
        const message = err instanceof Error ? err.message : String(err)
        setCvError(`${t('cv.previewFailed')} ${message}`)
      }
    } finally {
      if (guardRef.current.shouldAccept(requestId)) {
        setCvBusy(false)
      }
    }
  }

  const confirmExecute = async () => {
    if (!preview) return
    setCvError('')
    const requestId = guardRef.current.begin()
    setCvBusy(true)
    try {
      const next = await window.api.controlledVerification.confirm(preview.confirmationId)
      if (!guardRef.current.shouldAccept(requestId)) return
      setCvResult(next)
    } catch (err) {
      if (guardRef.current.shouldAccept(requestId)) {
        const message = err instanceof Error ? err.message : String(err)
        setCvError(`${t('cv.executionFailed')} ${message}`)
      }
    } finally {
      if (guardRef.current.shouldAccept(requestId)) {
        setCvBusy(false)
      }
    }
  }

  const cancelExecute = async () => {
    if (!preview) return
    try {
      await window.api.controlledVerification.cancel(preview.confirmationId)
    } catch {
      // best effort; the running command still settles on its own
    }
  }

  const fieldClass = 'w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500'

  const commandStatusColor = (status: string): string => {
    switch (status) {
      case 'PASS': return 'text-emerald-300'
      case 'FAIL': return 'text-red-300'
      case 'TIMEOUT': return 'text-amber-300'
      case 'CANCELLED': return 'text-gray-400'
      case 'ERROR': return 'text-red-300'
      default: return 'text-gray-300'
    }
  }

  return (
    <section className="w-full rounded-xl border border-gray-800 bg-gray-900/70 p-5 text-gray-300" aria-labelledby="verification-heading">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="verification-heading" className="text-lg font-semibold text-gray-100">{t('verification.title')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('verification.subtitle')}</p>
        </div>
        <span className="rounded-full border border-emerald-800/70 bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-300">{t('verification.badge')}</span>
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
          <input className={fieldClass} value={contract.title} onChange={event => setContractField('title', event.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500">
          {t('verification.goal')}
          <textarea className={fieldClass} rows={2} value={contract.goal} onChange={event => setContractField('goal', event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-gray-500">
            {t('verification.allowedPaths')}
            <textarea className={fieldClass} rows={3} value={lineValue(contract.allowedPaths)} onChange={event => setContractField('allowedPaths', lines(event.target.value))} />
          </label>
          <label className="grid gap-1 text-xs text-gray-500">
            {t('verification.forbiddenPaths')}
            <textarea className={fieldClass} rows={3} value={lineValue(contract.forbiddenPaths)} onChange={event => setContractField('forbiddenPaths', lines(event.target.value))} />
          </label>
        </div>
        <label className="grid gap-1 text-xs text-gray-500">
          {t('verification.acceptanceCriteria')}
          <textarea className={fieldClass} rows={2} value={lineValue(contract.acceptanceCriteria)} onChange={event => setContractField('acceptanceCriteria', lines(event.target.value))} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500">
          {t('verification.knownRisks')}
          <textarea className={fieldClass} rows={2} value={lineValue(contract.knownRisks)} onChange={event => setContractField('knownRisks', lines(event.target.value))} />
        </label>
      </div>

      {!cvResult && <p className="mt-3 text-xs text-amber-300/80">{t('verification.noCommand')}</p>}
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

      {/* ── 受控验证执行（Task 7） ─────────────────────────────── */}
      <div className="mt-6 rounded-lg border border-gray-800 bg-gray-950/60 p-4" role="region" aria-labelledby="cv-heading" aria-label={t('cv.title')}>
        <h3 id="cv-heading" className="text-sm font-semibold text-gray-200">{t('cv.title')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('cv.intro')}</p>

        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-xs text-gray-500">
            {t('cv.testPathLabel')}
            <input
              className={fieldClass}
              aria-label={t('cv.testPathLabel')}
              value={testPath}
              placeholder={t('cv.testPathPlaceholder')}
              onChange={event => {
                setTestPath(event.target.value)
                setPreview(null)
                setCvResult(null)
              }}
            />
          </label>
        </div>

        {!workspace?.selected && <p className="mt-3 text-xs text-gray-600">{t('cv.workspaceMissing')}</p>}
        {cvError && <p role="alert" className="mt-3 rounded-md border border-red-900/70 bg-red-950/40 p-3 text-xs text-red-300">{cvError}</p>}

        <button
          type="button"
          onClick={generatePreview}
          disabled={!previewReady || cvBusy}
          className="mt-3 w-full rounded-md border border-indigo-700 bg-indigo-950/40 px-4 py-2 text-sm font-medium text-indigo-200 hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cvBusy && !preview ? t('cv.generating') : t('cv.generatePreview')}
        </button>

        {preview && (
          <div className="mt-4 space-y-3" aria-live="polite">
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="shrink-0 text-gray-500">{t('cv.command')}</span>
                <code className="min-w-0 truncate text-gray-200">{preview.commandPreview}</code>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="shrink-0 text-gray-500">{t('cv.timeout')}</span>
                <span className="text-gray-300">{preview.timeoutMs / 1000}s</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="shrink-0 text-gray-500">{t('cv.codeDigest')}</span>
                <code className="min-w-0 max-w-[60%] truncate text-gray-300">{preview.subjectDigest}</code>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="shrink-0 text-gray-500">{t('cv.isolation')}</span>
                <span className="min-w-0 text-right text-gray-300">{preview.isolationLevels.join(', ')}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="shrink-0 text-gray-500">{t('cv.environmentProfile')}</span>
                <code className="min-w-0 truncate text-gray-300">{preview.environmentProfile}</code>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="shrink-0 text-gray-500">{t('cv.expiration')}</span>
                <span className="min-w-0 text-right text-gray-300">{new Date(preview.expiration).toLocaleString()}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="shrink-0 text-gray-500">{t('cv.previewHash')}</span>
                <code className="min-w-0 max-w-[60%] truncate text-gray-400">{preview.previewHash}</code>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmExecute}
                disabled={cvBusy}
                className="flex-1 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {cvBusy ? t('cv.confirming') : t('cv.confirmExecute')}
              </button>
              <button
                type="button"
                onClick={cancelExecute}
                disabled={!cvBusy}
                className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('cv.cancel')}
              </button>
            </div>
          </div>
        )}

        {cvResult && (
          <div className="mt-4 space-y-3" aria-live="polite">
            {cvResult.state === 'rejected' ? (
              <div className="rounded-lg border border-amber-800/70 bg-amber-950/30 p-3">
                <div className="text-sm font-medium text-amber-300">{t('cv.rejected')}</div>
                <p className="mt-1 text-xs leading-relaxed text-amber-200/80">{t(`cv.reason.${cvResult.reason}`)}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">{t('cv.status')}</span>
                    <span className={commandStatusColor(cvResult.commandStatus)}>{t(`cv.status.${cvResult.commandStatus}`)}</span>
                  </div>
                  {cvResult.exitCode !== null && (
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <span className="text-gray-500">{t('cv.exitCode')}</span>
                      <span className="text-gray-300">{cvResult.exitCode}</span>
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="text-gray-500">{cvResult.subjectStable ? t('cv.subjectStable') : t('cv.subjectChanged')}</span>
                    <span className={cvResult.subjectStable ? 'text-emerald-300' : 'text-amber-300'}>{cvResult.subjectStable ? '✓' : '✗'}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="text-gray-500">{cvResult.evidence ? (cvResult.evidence.valid ? t('cv.evidenceValid') : t('cv.evidenceInvalid')) : '—'}</span>
                    <span className={cvResult.evidence?.valid ? 'text-emerald-300' : 'text-amber-300'}>{cvResult.evidence?.valid ? '✓' : '✗'}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="text-gray-500">{cvResult.evidence ? (cvResult.evidence.fresh ? t('cv.evidenceFresh') : t('cv.evidenceStale')) : '—'}</span>
                    <span className={cvResult.evidence?.fresh ? 'text-emerald-300' : 'text-amber-300'}>{cvResult.evidence?.fresh ? '✓' : '✗'}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="text-gray-500">{t('cv.criterionVerdict')}</span>
                    <span className={cvResult.criterion.verdict === 'VERIFIED' ? 'text-emerald-300' : cvResult.criterion.verdict === 'FAILED' ? 'text-red-300' : 'text-amber-300'}>
                      {t(`cv.verdict.${cvResult.criterion.verdict}`)}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="mb-1 text-xs font-medium text-gray-500">{t('cv.stdout')}{cvResult.stdoutTruncated ? ` ${t('cv.truncated')}` : ''}</h4>
                  <pre className="max-h-40 overflow-auto rounded bg-gray-950/70 p-2 text-[11px] leading-relaxed text-gray-400 whitespace-pre-wrap break-all">{cvResult.stdout || '(empty)'}</pre>
                </div>
                <div>
                  <h4 className="mb-1 text-xs font-medium text-gray-500">{t('cv.stderr')}{cvResult.stderrTruncated ? ` ${t('cv.truncated')}` : ''}</h4>
                  <pre className="max-h-40 overflow-auto rounded bg-gray-950/70 p-2 text-[11px] leading-relaxed text-gray-400 whitespace-pre-wrap break-all">{cvResult.stderr || '(empty)'}</pre>
                </div>
                <div>
                  <h4 className="mb-1 text-xs font-medium text-gray-500">{t('cv.decisionTrace')}</h4>
                  <pre className="max-h-40 overflow-auto rounded bg-gray-950/70 p-2 text-[11px] leading-relaxed text-gray-500">{cvResult.criterion.decisionTrace.join('\n')}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
