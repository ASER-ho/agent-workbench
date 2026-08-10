// Receipt — the formal, immutable verification artifact.
// Shows real Receipt identity, overall verdict, subject, digest, and the real
// available exports. Acceptance is fixed to NOT_RECORDED and VERIFIED is never
// presented as ACCEPTED. When no immutable Receipt has materialized yet, the
// section shows only what is genuinely derivable from the execution result.

import type { ControlledVerificationResult } from '../../../shared/controlled-verification-execution-types'
import { VERIFICATION_RECEIPT_SCHEMA } from '../../../shared/verification-receipt-types'
import type { VerificationReceipt } from '../../../shared/verification-receipt-types'
import type { ResultExportKind, ResultLocale } from './result-types'
import { ACCEPTANCE_NOT_RECORDED, tr, truncateMiddle, verdictColor, verdictLabel } from './result-shared'

interface ReceiptCardProps {
  result: ControlledVerificationResult
  locale?: ResultLocale
  receipt?: VerificationReceipt | null
  onExport?: (kind: ResultExportKind) => void
  exportPending?: boolean
}

export default function ReceiptCard({ result, locale, receipt, onExport, exportPending }: ReceiptCardProps) {
  const overallVerdict = result.state === 'executed' ? result.criterion.verdict : 'NOT_EVALUATED'
  const subjectDigest = result.state === 'executed' ? result.subjectBeforeDigest : '—'

  const exportButton = (label: { zh: string; en: string }, kind: ResultExportKind) => (
    <button
      key={kind}
      type="button"
      disabled={exportPending}
      onClick={() => onExport?.(kind)}
      className="rounded-md px-3 py-1.5 text-xs transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
    >
      {tr(locale, label.zh, label.en)}
    </button>
  )

  return (
    <section
      className="rounded-lg border p-4"
      aria-label={tr(locale, '验证回执', 'Verification receipt')}
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {tr(locale, '验证回执', 'Verification Receipt')}
          </h3>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            <code>{VERIFICATION_RECEIPT_SCHEMA}</code>
          </div>
        </div>
        <span
          className="rounded-md border px-2 py-1 text-xs font-semibold"
          style={{ color: verdictColor(overallVerdict), borderColor: verdictColor(overallVerdict) }}
        >
          {verdictLabel(locale, overallVerdict)}
        </span>
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        {receipt ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '回执摘要', 'Receipt digest')}</dt>
              <dd className="min-w-0">
                <code className="block text-right text-[11px]" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }} title={receipt.receiptDigest}>
                  {receipt.receiptDigest}
                </code>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, 'Subject', 'Subject')}</dt>
              <dd className="min-w-0">
                <code className="block text-right text-[11px]" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }} title={receipt.subject.subjectDigest}>
                  {truncateMiddle(receipt.subject.subjectDigest, 24, 10)}
                </code>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '快照完整', 'Snapshot complete')}</dt>
              <dd style={{ color: receipt.subject.complete ? 'var(--verified)' : 'var(--warn)' }}>
                {receipt.subject.complete ? tr(locale, '是', 'Yes') : tr(locale, '否', 'No')}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '策略', 'Policy')}</dt>
              <dd className="min-w-0 truncate text-right text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {receipt.policy.freshnessPolicyId} · <code title={receipt.policy.policyDigest}>{truncateMiddle(receipt.policy.policyDigest, 16, 8)}</code>
              </dd>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, 'Subject 摘要', 'Subject digest')}</dt>
              <dd className="min-w-0">
                <code className="block text-right text-[11px]" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }} title={subjectDigest}>
                  {truncateMiddle(subjectDigest, 24, 10)}
                </code>
              </dd>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              {tr(
                locale,
                '完整不可变回执在执行完成并导出时生成。此视图直接来自本次执行记录。',
                'The full immutable Receipt materializes on export after execution. This view comes directly from the execution record.'
              )}
            </p>
          </>
        )}

        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '验收决定', 'Acceptance decision')}</dt>
          <dd className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>{ACCEPTANCE_NOT_RECORDED}</dd>
        </div>
      </dl>

      <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--warn)' }}>
        {tr(
          locale,
          'VERIFIED 是验证判定，不是验收决定（ACCEPT / SHARE / RELEASE）。验收保持 NOT_RECORDED。',
          'VERIFIED is a verification verdict, not an acceptance decision (ACCEPT / SHARE / RELEASE). Acceptance stays NOT_RECORDED.'
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onExport ? (
          <>
            {exportButton({ zh: '导出 JSON Receipt', en: 'Export JSON Receipt' }, 'json')}
            {exportButton({ zh: '导出 Markdown Handoff', en: 'Export Markdown Handoff' }, 'md')}
            {exportButton({ zh: '导出两者', en: 'Export both' }, 'both')}
          </>
        ) : (
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {tr(locale, '可用导出：JSON Receipt · Markdown Handoff', 'Available exports: JSON Receipt · Markdown Handoff')}
          </span>
        )}
      </div>
    </section>
  )
}
