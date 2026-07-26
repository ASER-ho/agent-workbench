import { useEffect, useRef, useState } from 'react'

import type {
  ActionApproval, ActionBinding, ActionExecutionResult, ActionProposal, ActionType, WorkReceipt
} from '../../../shared/action-types'
import type { SessionSnapshot } from '../../../shared/session-types'
import { useLocale } from '../../contexts/LocaleContext'

interface Props {
  snapshot: SessionSnapshot | null
  workspaceLabel: string
}

function bindingOf(proposal: ActionProposal): ActionBinding {
  return {
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash,
    sessionId: proposal.sessionId,
    workspaceId: proposal.workspaceId
  }
}

export default function ControlledActionPanel({ snapshot, workspaceLabel }: Props) {
  const { t } = useLocale()
  const [proposal, setProposal] = useState<ActionProposal | null>(null)
  const [approval, setApproval] = useState<ActionApproval | null>(null)
  const [receipt, setReceipt] = useState<WorkReceipt | null>(null)
  const [result, setResult] = useState<ActionExecutionResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const approveRef = useRef<HTMLButtonElement>(null)
  const running = snapshot?.status === 'running' && Boolean(snapshot.sessionId) && snapshot.workspaceLabel === workspaceLabel

  useEffect(() => {
    if (running) return
    if (proposal) {
      void window.api.action.cancel(bindingOf(proposal)).then(setReceipt).catch(() => setErrorKey('action.decisionFailed'))
    }
    setProposal(null)
    setApproval(null)
  }, [running, snapshot?.sessionId])

  useEffect(() => {
    if (!proposal) return
    approveRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        void cancelProposal()
        return
      }
      if (event.key !== 'Tab') return
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
      if (buttons.length < 2) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [proposal, busy])

  const review = async (actionType: ActionType) => {
    setBusy(true); setErrorKey(''); setResult(null)
    try {
      const next = await window.api.action.propose({ actionType, workspaceLabel })
      setProposal(next); setApproval(null); setReceipt(null)
    } catch { setErrorKey('action.proposeFailed') }
    finally { setBusy(false) }
  }

  const recoverReceipt = async (proposalId: string) => {
    const receipts = await window.api.action.getReceipts()
    const recovered = receipts.find(item => item.proposalId === proposalId)
    if (recovered) setReceipt(recovered)
  }

  const approveProposal = async () => {
    if (!proposal) return
    setBusy(true); setErrorKey('')
    try {
      const nextApproval = await window.api.action.approve(bindingOf(proposal))
      const receipts = await window.api.action.getReceipts()
      setApproval(nextApproval)
      setReceipt(receipts.find(item => item.proposalId === proposal.proposalId) ?? null)
      setProposal(null)
    } catch {
      await recoverReceipt(proposal.proposalId).catch(() => {})
      setProposal(null)
      setErrorKey('action.approveFailed')
    }
    finally { setBusy(false) }
  }

  const decide = async (decision: 'reject' | 'cancel') => {
    if (!proposal) return
    setBusy(true); setErrorKey('')
    try {
      const next = decision === 'reject'
        ? await window.api.action.reject(bindingOf(proposal))
        : await window.api.action.cancel(bindingOf(proposal))
      setReceipt(next); setProposal(null); setApproval(null)
    } catch {
      await recoverReceipt(proposal.proposalId).catch(() => {})
      setProposal(null)
      setErrorKey('action.decisionFailed')
    }
    finally { setBusy(false) }
  }

  const cancelProposal = () => decide('cancel')

  const executeApproved = async () => {
    if (!approval) return
    setBusy(true); setErrorKey('')
    try {
      const next = await window.api.action.execute(approval.approvalId)
      setResult(next); setReceipt(next.receipt); setApproval(null)
    } catch {
      await recoverReceipt(approval.proposalId).catch(() => {})
      setApproval(null)
      setErrorKey('action.executeFailed')
    }
    finally { setBusy(false) }
  }

  const visible = running || proposal || approval || receipt || result
  if (!visible) return null

  return (
    <section aria-labelledby="controlled-action-title" className="max-h-64 overflow-auto border-t border-slate-700 bg-slate-950 px-3 py-3 flex-shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="controlled-action-title" className="text-xs font-semibold text-slate-100">{t('action.title')}</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">{t('action.fixtureOnly')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => review('command')} disabled={!running || busy || Boolean(approval)} className="min-h-9 rounded border border-slate-600 px-3 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-300">{t('action.reviewCommand')}</button>
          <button onClick={() => review('file_change')} disabled={!running || busy || Boolean(approval)} className="min-h-9 rounded border border-slate-600 px-3 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-300">{t('action.reviewFile')}</button>
          {approval && <button onClick={executeApproved} disabled={!running || busy} className="min-h-9 rounded bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-300">{busy ? t('action.executing') : t('action.executeApproved')}</button>}
        </div>
      </div>

      {errorKey && <div role="alert" className="mt-2 rounded border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-100">{t(errorKey)} {t('action.retryHint')}</div>}
      {receipt && (
        <div aria-live="polite" className="mt-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
          <span className="font-medium">{t('action.receipt')}:</span> {t('action.status.' + receipt.status)} {'•'} {receipt.actionType === 'command' ? t('action.command') : t('action.fileChange')} {'•'} <code>{receipt.exactTarget}</code>
          {receipt.exitCode !== undefined && <span> {'•'} {t('action.exitCode')} {receipt.exitCode}</span>}
        </div>
      )}

      {result && (
        <div className="mt-2 grid gap-2 text-xs">
          {result.diff && <details className="rounded border border-slate-700 bg-slate-900 p-2"><summary className="cursor-pointer font-medium text-slate-200">{t('action.diff')}</summary><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-slate-300">{result.diff}</pre></details>}
          <details className="rounded border border-slate-700 bg-slate-900 p-2"><summary className="cursor-pointer font-medium text-slate-200">{t('action.handoff')}</summary><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-slate-300">{result.handoff}</pre></details>
          <details className="rounded border border-slate-700 bg-slate-900 p-2"><summary className="cursor-pointer font-medium text-slate-200">{t('action.safeShare')}</summary><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-slate-300">{result.safeShare.markdown}</pre><button onClick={() => navigator.clipboard.writeText(result.safeShare.markdown)} className="mt-2 min-h-9 rounded border border-slate-600 px-3 text-slate-100 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-300">{t('action.copySafeShare')}</button></details>
        </div>
      )}

      {proposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="action-review-title" aria-describedby="action-review-risk" className="w-full max-w-2xl rounded-xl border border-slate-600 bg-slate-950 p-5 shadow-2xl">
            <h2 id="action-review-title" className="text-base font-semibold text-white">{t('action.reviewTitle')}</h2>
            <p className="mt-1 text-sm text-slate-300">{t('action.reviewIntro')}</p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm">
              <dt className="text-slate-400">{t('action.type')}</dt><dd className="text-slate-100">{proposal.actionType === 'command' ? t('action.command') : t('action.fileChange')}</dd>
              <dt className="text-slate-400">{t('action.target')}</dt><dd className="break-all font-mono text-slate-100">{proposal.exactTarget}</dd>
              <dt className="text-slate-400">{t('action.workspace')}</dt><dd className="text-slate-100">{proposal.workspaceLabel}</dd>
              <dt className="text-slate-400">{t('action.risk')}</dt><dd className="text-amber-200">{t('action.riskLow')}</dd>
            </dl>
            {proposal.preview.kind === 'command' ? (
              <div className="mt-3 rounded border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
                <div><span className="text-slate-400">{t('action.executable')}:</span> <code>{proposal.preview.executable}</code></div>
                <div className="mt-2"><span className="text-slate-400">{t('action.arguments')}:</span><pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap">{JSON.stringify(proposal.preview.arguments, null, 2)}</pre></div>
                <div className="mt-2">{proposal.preview.expectedImpact}</div>
              </div>
            ) : (
              <div className="mt-3 rounded border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
                <div>{proposal.preview.expectedImpact}</div>
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap">{proposal.preview.diff}</pre>
              </div>
            )}
            <div id="action-review-risk" className="mt-3 rounded border border-amber-700/70 bg-amber-950/40 p-3 text-xs text-amber-100">{t('action.bindingNotice')}</div>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button onClick={cancelProposal} disabled={busy} className="min-h-10 rounded border border-slate-600 px-4 text-slate-200 hover:bg-slate-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-300">{t('action.cancel')}</button>
              <button onClick={() => decide('reject')} disabled={busy} className="min-h-10 rounded border border-red-600 px-4 text-red-200 hover:bg-red-950 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-300">{t('action.reject')}</button>
              <button ref={approveRef} onClick={approveProposal} disabled={busy} className="min-h-10 rounded bg-blue-600 px-4 text-white hover:bg-blue-500 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-300">{t('action.approve')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
