// Attention / Next Action panel.
//
// This is the action-oriented part of the Result surface. Failure, insufficient
// evidence, subject changes, and stale evidence are NEVER reduced to a badge:
// each gets an explanation plus a real, executable next step. No fake buttons —
// the next step is guidance for actions the real product supports (generate a
// new preview, confirm execution, export artifacts).

import type { ControlledVerificationResult } from '../../../shared/controlled-verification-execution-types'
import type { ResultLocale } from './result-types'
import { buildAttention, tr } from './result-shared'

interface AttentionPanelProps {
  result: ControlledVerificationResult
  locale?: ResultLocale
}

export default function AttentionPanel({ result, locale }: AttentionPanelProps) {
  const attention = buildAttention(result)
  const verdict = result.state === 'executed' ? result.criterion.verdict : 'NOT_EVALUATED'
  const accent = attention.kind === 'VERIFIED' ? 'var(--verified)' : attention.kind === 'FAILED' ? 'var(--failed)' : 'var(--warn)'

  return (
    <section
      className="rounded-lg border p-4"
      aria-label={tr(locale, '注意与下一步', 'Attention & next action')}
      style={{
        borderColor: 'var(--border-color)',
        background: 'var(--bg-secondary)',
        borderLeft: `3px solid ${accent}`
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
          {tr(locale, '下一步', 'Next action')}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {attention.headline.zh === attention.headline.en ? attention.headline.zh : tr(locale, attention.headline.zh, attention.headline.en)}
      </p>
      <ul className="mt-1.5 space-y-1">
        {attention.reasons.map((reason, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <span aria-hidden="true" style={{ color: accent }}>•</span>
            <span>{tr(locale, reason.zh, reason.en)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 rounded-md px-3 py-2 text-sm leading-relaxed" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '现在应该做什么', 'What to do now')}
        </span>
        <p className="mt-0.5">{tr(locale, attention.next.zh, attention.next.en)}</p>
      </div>
    </section>
  )
}
