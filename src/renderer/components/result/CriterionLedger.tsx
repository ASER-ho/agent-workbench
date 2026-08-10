// Criterion Work Surface — a compact ledger, not a card wall.
// One row per real Criterion outcome: Criterion | Evidence | Freshness | Verdict.
// Fields come exclusively from the real model (CriterionRow built in result-shared).

import type { KeyboardEvent } from 'react'
import type { CriterionVerdict } from '../../../shared/evaluation-types'
import type { ResultLocale } from './result-types'
import { tr, truncateMiddle, verdictColor, verdictLabel } from './result-shared'

export interface CriterionLedgerRow {
  criterionId: string
  verdict: CriterionVerdict
  ruleId: string
  decisionTrace: string[]
  boundEvidenceIds: string[]
  freshCount: number
  totalEvidence: number
  freshnessRecorded: boolean
}

interface CriterionLedgerProps {
  rows: CriterionLedgerRow[]
  locale?: ResultLocale
  selectedCriterionId?: string | null
  onSelectCriterion?: (criterionId: string | null) => void
}

export default function CriterionLedger({
  rows,
  locale,
  selectedCriterionId,
  onSelectCriterion
}: CriterionLedgerProps) {
  if (rows.length === 0) {
    return (
      <section aria-label={tr(locale, '条件台账', 'Criterion ledger')}>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '条件判定', 'Criterion outcomes')}
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '没有可用的 Criterion 结果。', 'No criterion results available.')}
        </p>
      </section>
    )
  }

  return (
    <section aria-label={tr(locale, '条件台账', 'Criterion ledger')}>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        {tr(locale, '条件判定', 'Criterion outcomes')}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th className="py-1.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {tr(locale, '条件', 'Criterion')}
              </th>
              <th className="py-1.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {tr(locale, '证据', 'Evidence')}
              </th>
              <th className="py-1.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {tr(locale, '新鲜度', 'Freshness')}
              </th>
              <th className="py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {tr(locale, '判定', 'Verdict')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const selected = selectedCriterionId === row.criterionId
              const color = verdictColor(row.verdict)
              const interactiveProps = onSelectCriterion
                ? {
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => onSelectCriterion(selected ? null : row.criterionId),
                    onKeyDown: (e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectCriterion(selected ? null : row.criterionId)
                      }
                    }
                  }
                : {}
              return (
                <tr
                  key={row.criterionId}
                  aria-selected={selected}
                  {...interactiveProps}
                  className={onSelectCriterion ? 'cursor-pointer' : undefined}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    background: selected ? 'var(--bg-tertiary)' : undefined
                  }}
                >
                  <td className="py-1.5 pr-3">
                    <code className="text-xs" style={{ color: 'var(--text-primary)' }}>{row.criterionId}</code>
                    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {truncateMiddle(row.ruleId, 24, 8)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {row.totalEvidence === 0 ? '—' : row.boundEvidenceIds.map(id => <code key={id} className="mr-1 text-[11px]">{id}</code>)}
                  </td>
                  <td
                    className="py-1.5 pr-3 text-xs"
                    style={{ color: row.freshnessRecorded && row.freshCount > 0 ? 'var(--verified)' : 'var(--text-tertiary)' }}
                    title={row.freshnessRecorded
                      ? undefined
                      : tr(locale, '新鲜度未记录于不可变回执', 'Freshness not recorded in the immutable receipt')}
                  >
                    {row.totalEvidence === 0
                      ? '—'
                      : row.freshnessRecorded
                        ? tr(locale, `${row.freshCount}/${row.totalEvidence} 新鲜`, `${row.freshCount}/${row.totalEvidence} fresh`)
                        : '—'}
                  </td>
                  <td className="py-1.5 text-right text-sm font-medium" style={{ color }}>
                    {verdictLabel(locale, row.verdict)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
