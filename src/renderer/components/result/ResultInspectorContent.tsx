// ResultInspectorContent — right-side Inspector body for the Result surface.
//
// Owned by C: Criterion, Evidence, Verdict Explanation, and Receipt.
// The integration agent wires this component into Inspector.tsx (which C does not
// edit). It is strictly presentational; selection is supplied by the parent.
//
// The critical behavior: when a Criterion is selected, the Inspector EXPLAINS how
// the bound Evidence affects that criterion's conclusion (using the real decision
// trace and the frozen evaluation rule semantics) — never a metadata dump.

import { EVAL_RULES } from '../../../shared/evaluation-policy-v1'
import type { ControlledVerificationResult } from '../../../shared/controlled-verification-execution-types'
import type { VerificationReceipt } from '../../../shared/verification-receipt-types'
import type { ResultInspectorContentProps } from './result-types'
import {
  buildAttention,
  buildCriterionRows,
  buildEvidenceRows,
  evidenceStatusColor,
  evidenceStatusLabel,
  formatIso,
  parseDecisionTrace,
  tr,
  truncateMiddle,
  verdictColor,
  verdictLabel
} from './result-shared'

function ruleExplanation(locale: ResultInspectorContentProps['locale'], ruleId: string): string {
  switch (ruleId) {
    case EVAL_RULES.ANY_FAIL:
      return tr(locale, '规则：证据中存在任何 FAIL 即判定 FAILED。', 'Rule: any FAIL among the fresh evidence yields FAILED.')
    case EVAL_RULES.PASS_WITHOUT_FAIL:
      return tr(locale, '规则：无 FAIL 且至少一条 PASS 即判定 VERIFIED。', 'Rule: no FAIL and at least one PASS yields VERIFIED.')
    case EVAL_RULES.NO_VALID_EVIDENCE:
      return tr(locale, '规则：没有有效且新鲜证据，判定 INSUFFICIENT_EVIDENCE。', 'Rule: no valid and fresh evidence yields INSUFFICIENT_EVIDENCE.')
    case EVAL_RULES.DISABLED:
      return tr(locale, '该 Criterion 未启用，判定 NOT_EVALUATED。', 'This criterion is disabled; the verdict is NOT_EVALUATED.')
    case EVAL_RULES.UNSUPPORTED:
      return tr(locale, '该 Criterion 不受支持，判定 NOT_EVALUATED。', 'This criterion is unsupported; the verdict is NOT_EVALUATED.')
    default:
      return tr(locale, `规则 ${ruleId} 决定该判定。`, `Rule ${ruleId} determines this verdict.`)
  }
}

function evidenceParticipation(
  locale: ResultInspectorContentProps['locale'],
  valid: boolean,
  fresh: boolean | null
): string {
  if (!valid) return tr(locale, '不参与判定：Subject 绑定失效', 'Excluded: subject binding broken')
  if (fresh === false) return tr(locale, '不参与判定：证据不新鲜', 'Excluded: evidence stale')
  if (fresh === true) return tr(locale, '参与判定：有效且新鲜', 'Participates: valid and fresh')
  return tr(locale, '参与判定（新鲜度未记录于回执）', 'Participates (freshness not recorded in receipt)')
}

function CriterionDetail({ result, criterionId, locale, receipt }: {
  result: ControlledVerificationResult
  criterionId: string
  locale?: ResultInspectorContentProps['locale']
  receipt?: VerificationReceipt | null
}) {
  const rows = buildCriterionRows(result, receipt)
  const criterion = rows.find(r => r.criterionId === criterionId) ?? rows[0]
  if (!criterion) {
    return <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '无 Criterion 详情。', 'No criterion details.')}</p>
  }
  const trace = parseDecisionTrace(criterion.decisionTrace)
  const evidence = buildEvidenceRows(result, receipt).filter(e => e.criterionId === criterion.criterionId)
  const color = verdictColor(criterion.verdict)

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, 'Criterion', 'Criterion')}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <code className="text-sm" style={{ color: 'var(--text-primary)' }}>{criterion.criterionId}</code>
          <span className="rounded border px-1.5 py-0.5 text-[11px] font-semibold" style={{ color, borderColor: color }}>
            {verdictLabel(locale, criterion.verdict)}
          </span>
        </div>
        <div className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          <code>{criterion.ruleId}</code>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {ruleExplanation(locale, criterion.ruleId)}
        </p>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '证据如何影响该判定', 'How evidence affects this verdict')}
        </div>
        {evidence.length === 0 ? (
          <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {tr(locale, '没有绑定此 Criterion 的证据。', 'No evidence is bound to this criterion.')}
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {evidence.map(e => (
              <li key={e.evidenceId} className="rounded border p-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{e.evidenceId}</code>
                  <span className="text-[11px] font-medium" style={{ color: evidenceStatusColor(e.status) }}>
                    {evidenceStatusLabel(locale, e.status)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {evidenceParticipation(locale, e.valid, e.fresh)}
                </div>
              </li>
            ))}
          </ul>
        )}
        {trace.validEvidence && (
          <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            {tr(
              locale,
              `有效证据计数：PASS ${trace.validEvidence.pass} · FAIL ${trace.validEvidence.fail} · UNKNOWN ${trace.validEvidence.unknown}；排除 ${trace.excluded ?? 0}，新鲜度排除 invalid=${trace.freshnessExcluded?.invalid ?? 0} future=${trace.freshnessExcluded?.future ?? 0} stale=${trace.freshnessExcluded?.stale ?? 0}。`,
              `Valid evidence counts: PASS ${trace.validEvidence.pass} · FAIL ${trace.validEvidence.fail} · UNKNOWN ${trace.validEvidence.unknown}; excluded ${trace.excluded ?? 0}, freshness excluded invalid=${trace.freshnessExcluded?.invalid ?? 0} future=${trace.freshnessExcluded?.future ?? 0} stale=${trace.freshnessExcluded?.stale ?? 0}.`
            )}
          </p>
        )}
      </div>
    </div>
  )
}

function EvidenceDetail({ result, evidenceId, locale, receipt }: {
  result: ControlledVerificationResult
  evidenceId: string
  locale?: ResultInspectorContentProps['locale']
  receipt?: VerificationReceipt | null
}) {
  const rows = buildEvidenceRows(result, receipt)
  const evidence = rows.find(e => e.evidenceId === evidenceId) ?? rows[0]
  if (!evidence) {
    return <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '无证据详情。', 'No evidence details.')}</p>
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '证据', 'Evidence')}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <code className="text-sm" style={{ color: 'var(--text-primary)' }}>{evidence.evidenceId}</code>
          <span className="text-[11px] font-medium" style={{ color: evidenceStatusColor(evidence.status) }}>
            {evidenceStatusLabel(locale, evidence.status)}
          </span>
        </div>
      </div>

      <dl className="space-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, 'Criterion', 'Criterion')}</dt>
          <dd className="min-w-0"><code className="text-[11px]">{evidence.criterionId}</code></dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '有效', 'Valid')}</dt>
          <dd style={{ color: evidence.valid ? 'var(--verified)' : 'var(--failed)' }}>
            {evidence.valid ? tr(locale, '是', 'Yes') : tr(locale, '否', 'No')}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '新鲜', 'Fresh')}</dt>
          <dd style={{ color: evidence.fresh === true ? 'var(--verified)' : evidence.fresh === false ? 'var(--warn)' : 'var(--text-tertiary)' }}>
            {evidence.fresh === true ? tr(locale, '是', 'Yes') : evidence.fresh === false ? tr(locale, '否', 'No') : '—'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '观察时间', 'Observed at')}</dt>
          <dd className="text-right text-[11px]" style={{ color: 'var(--text-secondary)' }}>{formatIso(evidence.observedAt)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '策略摘要', 'Policy digest')}</dt>
          <dd className="min-w-0">
            <code className="block text-right text-[11px]" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }} title={evidence.policyDigest}>
              {truncateMiddle(evidence.policyDigest, 20, 8)}
            </code>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>{tr(locale, 'Subject 绑定', 'Subject binding')}</dt>
          <dd className="min-w-0">
            <code className="block text-right text-[11px]" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }} title={evidence.subjectDigest}>
              {truncateMiddle(evidence.subjectDigest, 20, 8)}
            </code>
          </dd>
        </div>
      </dl>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '对 Criterion 结论的影响', 'Effect on the criterion verdict')}
        </div>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {evidence.valid && evidence.fresh !== false
            ? evidence.status === 'PASS'
              ? tr(
                locale,
                `该证据有效且新鲜，以 PASS 参与 Criterion ${evidence.criterionId} 的判定，支持 VERIFIED 结论。`,
                `This evidence is valid and fresh; as PASS it supports a VERIFIED verdict for criterion ${evidence.criterionId}.`
              )
              : evidence.status === 'FAIL'
                ? tr(
                  locale,
                  `该证据以 FAIL 参与判定，按规则将 Criterion ${evidence.criterionId} 判定为 FAILED。`,
                  `This evidence participates as FAIL; per rule it makes criterion ${evidence.criterionId} FAILED.`
                )
                : tr(
                  locale,
                  `该证据以 UNKNOWN 参与判定，不足以支撑 PASS，导致证据不足。`,
                  `This evidence participates as UNKNOWN; it cannot support a PASS and leaves the criterion without enough evidence.`
                )
            : tr(
              locale,
              `该证据 ${evidence.valid ? '不新鲜' : '无效'}，被排除在判定之外，不能证明 Criterion ${evidence.criterionId}。`,
              `This evidence is ${evidence.valid ? 'stale' : 'invalid'} and excluded from the evaluation; it cannot prove criterion ${evidence.criterionId}.`
            )}
        </p>
      </div>
    </div>
  )
}

function DefaultContent({ result, locale, receipt }: {
  result: ControlledVerificationResult
  locale?: ResultInspectorContentProps['locale']
  receipt?: VerificationReceipt | null
}) {
  const attention = buildAttention(result)
  const verdict = result.state === 'executed' ? result.criterion.verdict : 'NOT_EVALUATED'
  const color = verdictColor(verdict)
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '总体判定', 'Overall verdict')}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-sm font-semibold" style={{ color }}>{verdictLabel(locale, verdict)}</span>
        </div>
        <ul className="mt-1.5 space-y-1">
          {attention.reasons.map((reason, i) => (
            <li key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {tr(locale, reason.zh, reason.en)}
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            {tr(locale, '下一步', 'Next')}
          </span>{' '}
          {tr(locale, attention.next.zh, attention.next.en)}
        </p>
      </div>

      {receipt && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            {tr(locale, '回执身份', 'Receipt identity')}
          </div>
          <dl className="mt-1 space-y-1 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <dt style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '摘要', 'Digest')}</dt>
              <dd className="min-w-0">
                <code className="block text-right text-[11px]" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }} title={receipt.receiptDigest}>
                  {truncateMiddle(receipt.receiptDigest, 24, 10)}
                </code>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '验收决定', 'Acceptance')}</dt>
              <dd className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>{receipt.acceptanceDecision}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt style={{ color: 'var(--text-tertiary)' }}>{tr(locale, '策略', 'Policy')}</dt>
              <dd className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{receipt.policy.freshnessPolicyId}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}

export default function ResultInspectorContent({
  result,
  locale,
  selectedCriterionId,
  selectedEvidenceId,
  receipt
}: ResultInspectorContentProps) {
  const criterionRows = buildCriterionRows(result, receipt)
  const evidenceRows = buildEvidenceRows(result, receipt)
  const selectedEvidence = evidenceRows.find(e => e.evidenceId === selectedEvidenceId) ?? null
  const selectedCriterion = criterionRows.find(c => c.criterionId === selectedCriterionId) ?? null

  return (
    <div className="space-y-3" aria-label={tr(locale, 'Result 详情', 'Result details')}>
      {selectedEvidence
        ? <EvidenceDetail result={result} evidenceId={selectedEvidence.evidenceId} locale={locale} receipt={receipt} />
        : selectedCriterion
          ? <CriterionDetail result={result} criterionId={selectedCriterion.criterionId} locale={locale} receipt={receipt} />
          : <DefaultContent result={result} locale={locale} receipt={receipt} />}
    </div>
  )
}
