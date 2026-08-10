// Verification Workbench — 0.1.2-B Verification Production Workbench.
//
// Single user-visible main flow: DEFINE → REVIEW → VERIFY → RESULT.
// Timeout / Cancelled / Subject Changed / Insufficient Evidence / rejected
// confirmations are STATES of the RESULT stage, never navigation steps. No
// eight-phase pipeline, no six-step stepper, no fake progress, no fabricated
// evidence model.
//
// B owns DEFINE, REVIEW, VERIFY, and hands a real ControlledVerificationResult
// to the RESULT stage. The RESULT stage is a MINIMAL real result display and is
// the B→C handoff point: Agent C's ResultWorkbench replaces it at integration.
//
// This is the ONLY existing file changed by Agent B; AppShell mounts this default
// export unchanged.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VerificationContract, VerificationInspection } from '../../../shared/verification-types'
import type {
  ControlledVerificationPreview,
  ControlledVerificationResult
} from '../../../shared/controlled-verification-execution-types'
import { createInspectionGuard, sameWorkspace } from './inspection-guard'
import { useTr } from '../verification/verification-i18n'
import { computeCompleteness, validateContract } from '../verification/verification-form'
import ContractFormSection from '../verification/ContractFormSection'
import ReviewSection from '../verification/ReviewSection'
import VerifyRunningSection from '../verification/VerifyRunningSection'
import ResultSection from '../verification/ResultSection'
import { publishVerificationInspector } from '../verification/verification-inspector-bridge'

type WorkspaceStatus = Awaited<ReturnType<typeof window.api.workspaceSelection.getStatus>>
type FlowStage = 'define' | 'review' | 'verify' | 'result'

const DEFAULT_CONTRACT: VerificationContract = {
  title: '',
  goal: '',
  allowedPaths: ['src'],
  forbiddenPaths: ['.git'],
  acceptanceCriteria: ['所有当前修改都已分类'],
  knownRisks: ['尚未运行功能验证命令']
}

// Module-scoped draft so navigating away and back within the same session never
// silently drops unsaved input. No persistent Draft backend.
const draftStore: {
  contract: VerificationContract
  testPath: string
  committedContract: VerificationContract
  committedTestPath: string
  dirty: boolean
} = {
  contract: { ...DEFAULT_CONTRACT },
  testPath: 'test/example.test.mjs',
  committedContract: { ...DEFAULT_CONTRACT },
  committedTestPath: 'test/example.test.mjs',
  dirty: false
}

const stageMeta: Record<FlowStage, { labelZh: string; labelEn: string; subtitleZh: string; subtitleEn: string }> = {
  define: {
    labelZh: '定义合同',
    labelEn: 'Define',
    subtitleZh: '填写验证合同（目标、范围、验收标准、验证方法）。尚未运行功能验证命令；确认后生成执行预览。',
    subtitleEn: 'Define the verification contract (goal, scope, criteria, method). No functional verification command has been run yet; confirming will generate an execution preview.'
  },
  review: {
    labelZh: '执行预览',
    labelEn: 'Review',
    subtitleZh: '核对将验证什么与执行边界。下一步：一次确认后执行固定命令。',
    subtitleEn: 'Review what will be verified and the execution boundary. Next: confirm once to run the fixed command.'
  },
  verify: {
    labelZh: '验证执行',
    labelEn: 'Verify',
    subtitleZh: '正在执行受控验证。执行完成后自动显示真实结果。',
    subtitleEn: 'Controlled verification is running. Real results appear as soon as execution finishes.'
  },
  result: {
    labelZh: '结果',
    labelEn: 'Result',
    subtitleZh: '验证已完成。下一步：导出回执，或返回编辑合同。',
    subtitleEn: 'Verification finished. Next: export the receipt, or return to the contract.'
  }
}

export default function VerificationWorkbench() {
  const { tr } = useTr()
  const [stage, setStage] = useState<FlowStage>('define')
  const [contract, setContract] = useState<VerificationContract>(() => ({ ...draftStore.contract }))
  const [testPath, setTestPath] = useState(draftStore.testPath)
  const [committedContract, setCommittedContract] = useState<VerificationContract>(() => ({ ...draftStore.committedContract }))
  const [committedTestPath, setCommittedTestPath] = useState(draftStore.committedTestPath)
  const [dirty, setDirty] = useState(draftStore.dirty)
  const [showErrors, setShowErrors] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null)
  const [inspection, setInspection] = useState<VerificationInspection | null>(null)
  const [inspectionError, setInspectionError] = useState('')
  const [preview, setPreview] = useState<ControlledVerificationPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [cvResult, setCvResult] = useState<ControlledVerificationResult | null>(null)
  const [cvError, setCvError] = useState('')
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const guardRef = useRef(createInspectionGuard())
  const workspaceRef = useRef<WorkspaceStatus | null>(null)
  const timerRef = useRef<number | null>(null)

  const invalidateDerived = useCallback(() => {
    guardRef.current.invalidate()
    setInspection(null)
    setPreview(null)
    setCvResult(null)
    setInspectionError('')
    setPreviewError('')
    setCvError('')
    setExportMsg('')
  }, [])

  // ── Workspace ─────────────────────────────────────────────────────
  const applyWorkspace = useCallback((status: WorkspaceStatus) => {
    if (!sameWorkspace(workspaceRef.current, status)) {
      // Subject changed: a new workspace invalidates the current flow and returns
      // to DEFINE with the draft preserved.
      invalidateDerived()
      setStage('define')
    }
    workspaceRef.current = status
    setWorkspace(status)
  }, [invalidateDerived])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const status = await window.api.workspaceSelection.getStatus()
        if (!active) return
        applyWorkspace(status)
      } catch {
        if (!active) return
        invalidateDerived()
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
  }, [applyWorkspace, invalidateDerived])

  // ── Draft / dirty ─────────────────────────────────────────────────
  const handleDraftChange = useCallback((next: VerificationContract, nextTestPath: string) => {
    setContract(next)
    setTestPath(nextTestPath)
    draftStore.contract = { ...next }
    draftStore.testPath = nextTestPath
    draftStore.dirty = true
    setDirty(true)
    setShowErrors(false)
    invalidateDerived()
    setStage('define')
  }, [invalidateDerived])

  const handleCancelDefine = useCallback(() => {
    if (dirty) setDiscardOpen(true)
  }, [dirty])

  const handleDiscardClose = useCallback(() => setDiscardOpen(false), [])

  const handleDiscardConfirm = useCallback(() => {
    setContract({ ...committedContract })
    setTestPath(committedTestPath)
    draftStore.contract = { ...committedContract }
    draftStore.testPath = committedTestPath
    draftStore.dirty = false
    setDirty(false)
    setDiscardOpen(false)
    invalidateDerived()
    setStage('define')
    setShowErrors(false)
  }, [committedContract, committedTestPath, invalidateDerived])

  // ── REVIEW loading ────────────────────────────────────────────────
  const loadReview = useCallback(async () => {
    const requestId = guardRef.current.begin()
    setPreviewBusy(true)
    setPreviewError('')
    setInspectionError('')
    setInspection(null)
    setPreview(null)
    setCvError('')
    setExportMsg('')

    let freshWorkspace: WorkspaceStatus | null = null
    try {
      freshWorkspace = await window.api.workspaceSelection.getStatus()
    } catch {
      guardRef.current.invalidate()
      setPreviewError(tr('无法选择项目，请重试。', 'Could not refresh the project. Try again.'))
      setPreviewBusy(false)
      return
    }
    if (!freshWorkspace?.selected || freshWorkspace.displayId !== workspaceRef.current?.displayId) {
      applyWorkspace(freshWorkspace)
      setPreviewError(tr('无法选择项目，请重试。', 'Could not refresh the project. Try again.'))
      setPreviewBusy(false)
      return
    }

    // Subject / observation (scope inspection) — best effort, independent of preview.
    void (async () => {
      try {
        const next = await window.api.verification.inspect(contract)
        if (guardRef.current.shouldAccept(requestId)) setInspection(next)
      } catch {
        if (guardRef.current.shouldAccept(requestId)) {
          setInspectionError(tr('无法读取 Git 修改。请选择 Git 根目录并检查任务契约。', 'Could not read Git changes. Select the Git root and review the task contract.'))
        }
      }
    })()

    // Execution preview — real controlledVerification.preview IPC.
    try {
      const next = await window.api.controlledVerification.preview({ testPath: testPath.trim(), contract })
      if (!guardRef.current.shouldAccept(requestId)) return
      setPreview(next)
      setCvResult(null)
    } catch (err) {
      if (guardRef.current.shouldAccept(requestId)) {
        const message = err instanceof Error ? err.message : String(err)
        setPreviewError(message)
      }
    } finally {
      if (guardRef.current.shouldAccept(requestId)) setPreviewBusy(false)
    }
  }, [contract, testPath, tr, applyWorkspace])

  const handleContinueToReview = useCallback(async () => {
    const errors = validateContract(contract, testPath)
    const hasErrors = Object.keys(errors).length > 0
    setShowErrors(true)
    if (hasErrors) return
    setCommittedContract({ ...contract })
    setCommittedTestPath(testPath)
    draftStore.committedContract = { ...contract }
    draftStore.committedTestPath = testPath
    draftStore.dirty = false
    setDirty(false)
    setStage('review')
    await loadReview()
  }, [contract, testPath, loadReview])

  const handleBackToDefine = useCallback(() => {
    setShowErrors(false)
    setStage('define')
  }, [])

  const handleRegenerate = useCallback(async () => {
    setCvResult(null)
    setExportMsg('')
    setStage('review')
    await loadReview()
  }, [loadReview])

  // ── VERIFY running ────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    setElapsed(0)
    timerRef.current = window.setInterval(() => setElapsed(value => value + 1), 1000)
  }, [stopTimer])

  useEffect(() => () => stopTimer(), [stopTimer])

  const handleConfirmExecute = useCallback(async () => {
    if (!preview) return
    let freshWorkspace: WorkspaceStatus | null = null
    try {
      freshWorkspace = await window.api.workspaceSelection.getStatus()
    } catch {
      setPreviewError(tr('无法选择项目，请重试。', 'Could not refresh the project. Try again.'))
      return
    }
    if (!freshWorkspace?.selected || freshWorkspace.displayId !== workspaceRef.current?.displayId) {
      applyWorkspace(freshWorkspace)
      setPreviewError(tr('无法选择项目，请重试。', 'Could not refresh the project. Try again.'))
      return
    }
    const requestId = guardRef.current.begin()
    setConfirmBusy(true)
    setCvError('')
    setStage('verify')
    setElapsed(0)
    startTimer()
    try {
      const next = await window.api.controlledVerification.confirm(preview.confirmationId)
      if (!guardRef.current.shouldAccept(requestId)) return
      setCvResult(next)
      setStage('result')
    } catch {
      if (guardRef.current.shouldAccept(requestId)) {
        setCvError(tr('执行失败或已中断。', 'Execution failed or was interrupted.'))
        setStage('review')
      }
    } finally {
      if (guardRef.current.shouldAccept(requestId)) {
        setConfirmBusy(false)
        stopTimer()
      }
    }
  }, [preview, tr, applyWorkspace, startTimer, stopTimer])

  const handleCancelExecute = useCallback(async () => {
    if (!preview) return
    try {
      await window.api.controlledVerification.cancel(preview.confirmationId)
    } catch {
      // best effort; the running command still settles on its own
    }
  }, [preview])

  // ── Export (real IPC) ─────────────────────────────────────────────
  const exportReceipt = useCallback(async (kind: 'json' | 'md' | 'both') => {
    if (!cvResult || cvResult.state !== 'executed') return
    setExportMsg('')
    try {
      const outcome = await window.api.controlledVerification.exportReceipt(kind)
      if (outcome.ok) setExportMsg(tr('导出成功。', 'Export succeeded.'))
      else setExportMsg(`${tr('导出失败：', 'Export failed: ')}${outcome.error ?? ''}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setExportMsg(`${tr('导出失败：', 'Export failed: ')}${message}`)
    }
  }, [cvResult, tr])

  // ── Derived ───────────────────────────────────────────────────────
  const completeness = useMemo(() => computeCompleteness(contract, testPath), [contract, testPath])
  const fieldErrors = useMemo(() => validateContract(contract, testPath), [contract, testPath])
  const canContinue = completeness.goal && completeness.scope && completeness.criteria && completeness.method && completeness.risks
  const stageMetaCurrent = stageMeta[stage]

  // Publish inspector context for the integration agent.
  useEffect(() => {
    let context: 'contract' | 'subject' | 'execution' | 'running'
    if (stage === 'verify') context = 'running'
    else if (stage === 'review') context = preview ? 'execution' : 'subject'
    else context = 'contract'
    publishVerificationInspector({
      context,
      contract,
      testPath,
      workspace,
      inspection,
      preview,
      previewBusy,
      previewError,
      executing: stage === 'verify',
      elapsedSeconds: stage === 'verify' ? elapsed : undefined,
      commandStatus: cvResult && cvResult.state === 'executed' ? cvResult.commandStatus : undefined
    })
  }, [stage, contract, testPath, workspace, inspection, preview, previewBusy, previewError, elapsed, cvResult])

  return (
    <section className="mx-auto w-full px-1 py-1" style={{ maxWidth: 880 }} aria-labelledby="verification-heading">
      <header className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 id="verification-heading" className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
            {tr('只读验收', 'Read-only Verification')}
          </h1>
          <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: 'var(--line)', color: 'var(--text-tertiary)' }}>
            {tr(`阶段：${stageMetaCurrent.labelZh}`, `Stage: ${stageMetaCurrent.labelEn}`)}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {tr(stageMetaCurrent.subtitleZh, stageMetaCurrent.subtitleEn)}
        </p>
      </header>

      {stage === 'define' && (
        <ContractFormSection
          workspace={workspace}
          contract={contract}
          testPath={testPath}
          dirty={dirty}
          showErrors={showErrors}
          fieldErrors={fieldErrors}
          completeness={completeness}
          canContinue={canContinue}
          chooseBusy={false}
          onChooseWorkspace={async () => {
            try {
              const response = await window.api.workspaceSelection.choose()
              if (response.status.selected) applyWorkspace(response.status)
            } catch {
              setPreviewError(tr('无法选择项目，请重试。', 'Could not choose the project. Try again.'))
            }
          }}
          onChange={handleDraftChange}
          onCancel={handleCancelDefine}
          onContinue={() => { void handleContinueToReview() }}
          discardOpen={discardOpen}
          onDiscardClose={handleDiscardClose}
          onDiscardConfirm={handleDiscardConfirm}
        />
      )}

      {stage === 'review' && (
        <ReviewSection
          workspace={workspace}
          contract={contract}
          testPath={testPath}
          inspection={inspection}
          inspectionError={inspectionError}
          preview={preview}
          previewBusy={previewBusy}
          previewError={previewError}
          confirmBusy={confirmBusy}
          confirmError={cvError}
          onBackToDefine={handleBackToDefine}
          onRegenerate={() => { void handleRegenerate() }}
          onConfirm={() => { void handleConfirmExecute() }}
        />
      )}

      {stage === 'verify' && (
        <VerifyRunningSection
          testPath={testPath}
          commandPreview={preview?.commandPreview ?? `node --test ${testPath}`}
          elapsedSeconds={elapsed}
          onCancel={() => { void handleCancelExecute() }}
        />
      )}

      {stage === 'result' && cvResult && (
        <ResultSection
          result={cvResult}
          exportMsg={exportMsg}
          onExport={exportReceipt}
          onBackToDefine={handleBackToDefine}
          onRegenerate={() => { void handleRegenerate() }}
        />
      )}
    </section>
  )
}
