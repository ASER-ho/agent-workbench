// Overall Verdict + Explanation.
// Consumes ONLY the real criterion verdict on the ControlledVerificationResult;
// it never recomputes semantics. The verdict is prominent but not a hero banner.

import type { ControlledVerificationResult } from '../../../shared/controlled-verification-execution-types'
import type { ResultLocale } from './result-types'
import {
  buildAttention,
  tr,
  verdictColor,
  verdictLabel
} from './result-shared'

interface ResultVerdictProps {
  result: ControlledVerificationResult
  locale?: ResultLocale
}

export default function ResultVerdict({ result, locale }: ResultVerdictProps) {
  const attention = buildAttention(result)
  const verdict = result.state === 'executed' ? result.criterion.verdict : 'NOT_EVALUATED'
  const color = verdictColor(verdict)
  const criterionId = result.state === 'executed'
    ? (result.evidence?.criterionId ?? result.criterion.decisionTrace[1]?.replace('criterion:', '') ?? '—')
    : '—'

  return (
    <section aria-label={tr(locale, '总体判定', 'Overall verdict')}>
      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: color,
          background: verdict === 'NOT_EVALUATED' ? 'var(--bg-secondary)' : undefined,
          boxShadow: verdict === 'VERIFIED' || verdict === 'FAILED' ? `inset 3px 0 0 0 ${color}` : undefined
        }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            aria-label={tr(locale, '判定', 'Verdict')}
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: color }}
          />
          <span className="text-[15px] font-semibold leading-tight" style={{ color }}>
            {verdictLabel(locale, verdict)}
          </span>
          {criterionId !== '—' && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {tr(locale, '来自', 'from')} <code className="text-[11px]">{criterionId}</code>
            </span>
          )}
        </div>

        {/* Explanation — why this verdict, from real execution data */}
        <div className="mt-2 space-y-1">
          {attention.reasons.map((reason, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {tr(locale, reason.zh, reason.en)}
            </p>
          ))}
        </div>

      </div>
    </section>
  )
}
