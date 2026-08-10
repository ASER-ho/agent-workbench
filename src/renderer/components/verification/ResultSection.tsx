// RESULT — real result surface for controlled verification.
//
// This is the B→C handoff point. It shows the MINIMAL real result: overall
// verdict, criterion result, receipt identity + real export buttons (calling the
// existing controlledVerification.exportReceipt IPC), and a next-action note.
// Agent C's ResultWorkbench replaces this panel at integration.
//
// Abnormal outcomes (Cancelled / Timeout / Execution Error / Subject Changed /
// Insufficient Evidence / rejected confirmation) are STATES, not navigation
// steps. Each tells the user what happened, why, and what to do next, and the
// next-step actions map to real operations only.

import type {
  ControlledVerificationCommandStatus,
  ControlledVerificationRejectionReason,
  ControlledVerificationResult
} from '../../../shared/controlled-verification-execution-types'
import { useTr } from './verification-i18n'
import { controlBtn, mono } from './verification-styles'

export interface ResultSectionProps {
  result: ControlledVerificationResult
  exportMsg: string
  onExport: (kind: 'json' | 'md' | 'both') => void
  onBackToDefine: () => void
  onRegenerate: () => void
}

interface ExceptionBlock {
  key: string
  what: string
  why: string
  next: string
}

const commandStatusMeta: Record<ControlledVerificationCommandStatus, { label: string; color: string }> = {
  PASS: { label: '通过', color: 'var(--verified)' },
  FAIL: { label: '失败', color: 'var(--failed)' },
  TIMEOUT: { label: '超时', color: 'var(--warn)' },
  CANCELLED: { label: '已取消', color: 'var(--ink-2)' },
  ERROR: { label: '启动/运行错误', color: 'var(--failed)' }
}

const rejectionMeta: Record<ControlledVerificationRejectionReason, { title: string; why: string; next: string }> = {
  CONFIRMATION_NOT_FOUND: {
    title: '确认不存在或已被新的预览替换。',
    why: '在生成预览后，你可能重新生成了预览或修改了合同/验证方法。',
    next: '重新生成预览并确认。'
  },
  CONFIRMATION_CONSUMED: {
    title: '该确认已被使用一次，不可重放。',
    why: '确认是单次使用、不可重放，用于防止重复执行。',
    next: '如需再次验证，重新生成预览并确认。'
  },
  CONFIRMATION_EXPIRED: {
    title: '确认已过期。',
    why: '预览在 5 分钟后过期。',
    next: '重新生成预览并确认。'
  },
  CONFIRMATION_STALE: {
    title: '代码或工作区已变化，确认失效。',
    why: 'Subject 快照已变化，当前确认不能证明原验证对象。',
    next: '重新检查对象并重新生成预览，然后重新验证。'
  },
  SUBJECT_SNAPSHOT_INCOMPLETE: {
    title: '当前代码状态无法完整捕获，已拒绝执行。',
    why: 'Subject 快照不完整。',
    next: '确认工作区 Git 状态可读后重新生成预览。'
  }
}

function StepLine({ label, children, color }: { label: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      <span className="min-w-0 text-sm leading-relaxed" style={{ color: color ?? 'var(--ink)' }}>{children}</span>
    </div>
  )
}

function ExportButtons({ exportMsg, onExport }: { exportMsg: string; onExport: (kind: 'json' | 'md' | 'both') => void }) {
  const { tr } = useTr()
  const btn = (label: string, onClick: () => void, primary?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-3 text-xs font-medium transition-colors hover:opacity-90"
      style={{
        ...controlBtn,
        background: primary ? 'var(--indigo)' : 'var(--surface)',
        color: primary ? '#fff' : 'var(--ink)',
        borderColor: 'var(--line)'
      }}
    >
      {label}
    </button>
  )
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {btn(tr('导出 JSON Receipt', 'Export JSON Receipt'), () => onExport('json'))}
      {btn(tr('导出 Markdown Handoff', 'Export Markdown Handoff'), () => onExport('md'))}
      {btn(tr('导出两者', 'Export both'), () => onExport('both'), true)}
      {exportMsg && <span className="text-xs" style={{ color: 'var(--warn)' }}>{exportMsg}</span>}
    </div>
  )
}

export default function ResultSection({
  result,
  exportMsg,
  onExport,
  onBackToDefine,
  onRegenerate
}: ResultSectionProps) {
  const { tr } = useTr()

  // ── Rejected result ────────────────────────────────────────────────
  if (result.state === 'rejected') {
    const meta = rejectionMeta[result.reason] ?? {
      title: tr('确认被拒绝。', 'Confirmation was rejected.'),
      why: tr('未知原因。', 'Unknown reason.'),
      next: tr('重新生成预览并确认。', 'Regenerate the preview and confirm.')
    }
    return (
      <section role="region" aria-label={tr('验证结果', 'Verification result')} className="space-y-5" style={{ maxWidth: 880, margin: '0 auto' }}>
        <div className="rounded-lg border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--warn)' }}>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-base" style={{ color: 'var(--warn)' }}>✗</span>
            <h2 className="text-base font-semibold" style={{ color: 'var(--warn)' }}>
              {tr('验证被拒绝', 'Verification rejected')}
            </h2>
          </div>
          <div className="mt-3 space-y-2">
            <StepLine label={tr('发生了什么', 'What happened')}>{meta.title}</StepLine>
            <StepLine label={tr('为什么', 'Why')}>{meta.why}</StepLine>
            <StepLine label={tr('下一步', 'Next step')}>{meta.next}</StepLine>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onBackToDefine}
              className="rounded-md border px-4 text-sm font-medium transition-colors hover:opacity-90"
              style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
            >
              {tr('返回编辑合同', 'Back to contract')}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              className="rounded-md px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ ...controlBtn, background: 'var(--indigo)' }}
            >
              {tr('重新生成预览并验证', 'Regenerate preview & verify')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  // ── Executed result ────────────────────────────────────────────────
  const r = result
  const verdictMeta = {
    VERIFIED: { label: tr('已验证', 'Verified'), color: 'var(--verified)', bg: 'var(--verified-soft)' },
    FAILED: { label: tr('验收失败', 'Acceptance failed'), color: 'var(--failed)', bg: 'var(--failed-soft)' },
    INSUFFICIENT_EVIDENCE: { label: tr('证据不足', 'Insufficient evidence'), color: 'var(--warn)', bg: 'var(--warn-soft)' },
    NOT_EVALUATED: { label: tr('未评估', 'Not evaluated'), color: 'var(--ink-2)', bg: 'var(--surface-2)' }
  }[r.criterion.verdict]
  const statusMeta = commandStatusMeta[r.commandStatus]

  const exceptions: ExceptionBlock[] = []
  if (r.commandStatus === 'CANCELLED') {
    exceptions.push({
      key: 'cancelled',
      what: tr('验证执行被取消。', 'Verification execution was cancelled.'),
      why: tr('你点击了取消，或执行被系统中断。', 'You cancelled, or the execution was interrupted.'),
      next: tr('如需验证，重新生成预览并确认执行。', 'To verify, regenerate the preview and confirm.')
    })
  }
  if (r.commandStatus === 'TIMEOUT') {
    exceptions.push({
      key: 'timeout',
      what: tr('验证执行超时。', 'Verification execution timed out.'),
      why: tr(`命令在 ${r.timeoutMs / 1000}s 内未完成。`, `The command did not finish within ${r.timeoutMs / 1000}s.`),
      next: tr('检查测试是否卡住；返回预览重新执行，或编辑合同后重试。', 'Check whether the test hangs; return to the preview and re-run, or edit the contract and retry.')
    })
  }
  if (r.commandStatus === 'ERROR') {
    exceptions.push({
      key: 'executionError',
      what: tr('无法启动或运行测试命令。', 'The test command could not start or run.'),
      why: tr('例如 node.exe 启动失败或进程异常退出。', 'For example, node.exe failed to start or the process exited abnormally.'),
      next: tr('检查测试文件与 node 环境；返回预览重新生成。', 'Check the test file and node environment; return to the preview and regenerate.')
    })
  }
  if (r.subjectChangedDuringVerification) {
    exceptions.push({
      key: 'subjectChanged',
      what: tr('验证期间项目状态发生变化。', 'The project state changed during verification.'),
      why: tr('当前证据不能证明原验证对象；Subject 快照前后不一致。', 'The current evidence cannot prove the original subject; the snapshot changed before/after.'),
      next: tr('重新检查对象（重新生成预览以重新捕获 Subject），然后重新验证。', 'Re-check the subject (regenerate the preview to re-capture it), then re-verify.')
    })
  }
  if (r.criterion.verdict === 'INSUFFICIENT_EVIDENCE') {
    exceptions.push({
      key: 'insufficientEvidence',
      what: tr('没有足够证据判定验收标准。', 'There is not enough evidence to evaluate the acceptance criterion.'),
      why: tr('证据缺失、过期或无效。', 'Evidence is missing, stale, or invalid.'),
      next: tr('重新生成预览并重新验证。', 'Regenerate the preview and re-verify.')
    })
  }

  return (
    <section role="region" aria-label={tr('验证结果', 'Verification result')} className="space-y-5" style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* Overall verdict */}
      <div className="rounded-lg border p-5" style={{ background: verdictMeta.bg, borderColor: verdictMeta.color }}>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="text-lg" style={{ color: verdictMeta.color }}>
            {r.criterion.verdict === 'VERIFIED' ? '✓' : r.criterion.verdict === 'FAILED' ? '✗' : '⚠'}
          </span>
          <div>
            <div className="text-base font-semibold" style={{ color: verdictMeta.color }}>
              {verdictMeta.label}
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-2)' }}>
              {tr('命令状态', 'Command status')}: <span style={{ color: statusMeta.color }}>{statusMeta.label}</span>
              {r.exitCode !== null && <> · {tr('退出码', 'exit code')} <span className="font-mono">{r.exitCode}</span></>}
            </div>
          </div>
        </div>
      </div>

      {/* Exception states */}
      {exceptions.length > 0 && (
        <div className="space-y-3">
          {exceptions.map(ex => (
            <div key={ex.key} className="rounded-lg border px-4 py-3" style={{ background: 'var(--surface)', borderColor: 'var(--warn)' }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>
                {tr('状态：', 'State: ')}{ex.what}
              </div>
              <div className="mt-2 space-y-1.5">
                <StepLine label={tr('为什么', 'Why')} color="var(--ink-2)">{ex.why}</StepLine>
                <StepLine label={tr('下一步', 'Next step')} color="var(--ink)">{ex.next}</StepLine>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onBackToDefine}
              className="rounded-md border px-4 text-sm font-medium transition-colors hover:opacity-90"
              style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
            >
              {tr('返回编辑合同', 'Back to contract')}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              className="rounded-md px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ ...controlBtn, background: 'var(--indigo)' }}
            >
              {tr('重新生成预览并验证', 'Regenerate preview & verify')}
            </button>
          </div>
        </div>
      )}

      {/* Criterion + evidence detail */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            {tr('Criterion 判定', 'Criterion verdict')}
          </div>
          <div className="mt-2 space-y-1.5 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: 'var(--text-tertiary)' }}>{tr('规则', 'Rule')}</span>
              <span className="font-mono" style={{ color: 'var(--ink)' }}>{r.criterion.ruleId}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: 'var(--text-tertiary)' }}>{tr('判定', 'Verdict')}</span>
              <span style={{ color: verdictMeta.color }}>{verdictMeta.label}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: 'var(--text-tertiary)' }}>{tr('Subject 前后一致', 'Subject stable')}</span>
              <span style={{ color: r.subjectStable ? 'var(--verified)' : 'var(--warn)' }}>
                {r.subjectStable ? tr('一致', 'Stable') : tr('已变化', 'Changed')}
              </span>
            </div>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium" style={{ color: 'var(--indigo)' }}>
              {tr('决策轨迹', 'Decision trace')}
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded border p-2 text-xs leading-relaxed" style={{ ...mono, borderColor: 'var(--line)', color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
              {r.criterion.decisionTrace.join('\n')}
            </pre>
          </details>
        </div>

        <div className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            {tr('证据', 'Evidence')}
          </div>
          {r.evidence ? (
            <div className="mt-2 space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: 'var(--text-tertiary)' }}>{tr('状态', 'Status')}</span>
                <span style={{ color: r.evidence.status === 'PASS' ? 'var(--verified)' : r.evidence.status === 'FAIL' ? 'var(--failed)' : 'var(--warn)' }}>
                  {r.evidence.status}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: 'var(--text-tertiary)' }}>{tr('证据有效', 'Evidence valid')}</span>
                <span style={{ color: r.evidence.valid ? 'var(--verified)' : 'var(--warn)' }}>{r.evidence.valid ? '✓' : '✗'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: 'var(--text-tertiary)' }}>{tr('证据新鲜', 'Evidence fresh')}</span>
                <span style={{ color: r.evidence.fresh ? 'var(--verified)' : 'var(--warn)' }}>{r.evidence.fresh ? '✓' : '✗'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: 'var(--text-tertiary)' }}>{tr('证据 ID', 'Evidence ID')}</span>
                <span className="font-mono" style={{ color: 'var(--ink)' }}>{r.evidence.evidenceId.slice(0, 18)}…</span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              {tr('没有记录到证据。', 'No evidence was recorded.')}
            </p>
          )}
        </div>
      </div>

      {/* Output */}
      <div className="grid gap-4 md:grid-cols-2">
        <details className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
          <summary className="cursor-pointer text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
            {tr('标准输出', 'Standard output')}{r.stdoutTruncated ? ` ${tr('（已截断）', '(truncated)')}` : ''}
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded border p-2 text-xs leading-relaxed" style={{ ...mono, borderColor: 'var(--line)', color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {r.stdout || '(empty)'}
          </pre>
        </details>
        <details className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
          <summary className="cursor-pointer text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
            {tr('标准错误', 'Standard error')}{r.stderrTruncated ? ` ${tr('（已截断）', '(truncated)')}` : ''}
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded border p-2 text-xs leading-relaxed" style={{ ...mono, borderColor: 'var(--line)', color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {r.stderr || '(empty)'}
          </pre>
        </details>
      </div>

      {/* Receipt identity + export */}
      <div className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr('回执与交接', 'Receipt & handoff')}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {tr(
            '验证决定为 NOT_RECORDED：本工作台不记录验收决定。导出将生成显示安全的 JSON Receipt 与 Markdown Handoff。',
            'The acceptance decision is NOT_RECORDED: this workbench records no acceptance decision. Export produces a display-safe JSON Receipt and Markdown Handoff.'
          )}
        </p>
        <ExportButtons exportMsg={exportMsg} onExport={onExport} />
      </div>

      {/* Next action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
          {r.criterion.verdict === 'VERIFIED'
            ? tr('下一步：导出回执，或返回编辑合同开始新的验证。', 'Next: export the receipt, or return to the contract to start a new verification.')
            : tr('下一步：检查结果输出并修正测试/代码，然后重新验证。', 'Next: review the output, fix the test/code, then re-verify.')}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToDefine}
            className="rounded-md border px-4 text-sm font-medium transition-colors hover:opacity-90"
            style={{ ...controlBtn, background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)' }}
          >
            {tr('返回编辑合同', 'Back to contract')}
          </button>
          {exceptions.length === 0 && (
            <button
              type="button"
              onClick={onRegenerate}
              className="rounded-md px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ ...controlBtn, background: 'var(--indigo)' }}
            >
              {tr('重新验证', 'Verify again')}
            </button>
          )}
        </div>
      </div>

      {/* B→C handoff marker */}
      <div className="rounded-lg border border-dashed px-4 py-3" style={{ borderColor: 'var(--indigo)' }}>
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--indigo)' }}>
          Handoff → Result Workbench (0.1.2-C)
        </div>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {tr(
            '本面板是 B→C 交接点：Agent C 的 ResultWorkbench 将替换此处的结果显示。当前为最小真实结果显示（总体判定、criterion 结果、真实导出）。',
            'This panel is the B→C handoff point: Agent C\x27s ResultWorkbench will replace this result display. It currently shows the minimal real result (overall verdict, criterion result, real export).'
          )}
        </p>
      </div>
    </section>
  )
}
