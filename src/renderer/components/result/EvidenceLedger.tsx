// Evidence Ledger — the primary visual language of the Result work surface.
// High-density, scannable, selectable. The main area answers: what evidence is,
// which criterion it binds to, whether it is fresh, and what the result is.
// Digest / subject binding / technical metadata belong to the Inspector.

import type { KeyboardEvent } from 'react'
import type { ResultLocale } from './result-types'
import { evidenceStatusColor, evidenceStatusLabel, tr } from './result-shared'

export interface EvidenceLedgerRow {
  evidenceId: string
  criterionId: string
  status: import('../../../shared/evaluation-types').EvidenceStatus
  valid: boolean
  /** null when the immutable Receipt does not record per-evidence freshness. */
  fresh: boolean | null
  observedAt: string
  policyDigest: string
  subjectDigest: string
  source: 'result' | 'receipt'
}

interface EvidenceLedgerProps {
  rows: EvidenceLedgerRow[]
  locale?: ResultLocale
  selectedEvidenceId?: string | null
  onSelectEvidence?: (evidenceId: string | null) => void
}

function freshnessCell(locale: ResultLocale | undefined, fresh: boolean | null): { label: string; color: string } {
  if (fresh === true) return { label: tr(locale, '新鲜', 'Fresh'), color: 'var(--verified)' }
  if (fresh === false) return { label: tr(locale, '不新鲜', 'Stale'), color: 'var(--warn)' }
  return { label: tr(locale, '—', '—'), color: 'var(--text-tertiary)' }
}

export default function EvidenceLedger({
  rows,
  locale,
  selectedEvidenceId,
  onSelectEvidence
}: EvidenceLedgerProps) {
  return (
    <section aria-label={tr(locale, '证据台账', 'Evidence ledger')}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '证据台账', 'Evidence ledger')}
        </h3>
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, `${rows.length} 条`, `${rows.length} items`)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {tr(locale, '没有可用证据。', 'No evidence available.')}
        </p>
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border" style={{ borderColor: 'var(--border-color)' }}>
          <table className="w-full min-w-[460px] border-collapse text-sm">
            <thead className="sticky top-0" style={{ background: 'var(--bg-secondary)' }}>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th className="py-1.5 pl-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  {tr(locale, '证据', 'Evidence')}
                </th>
                <th className="py-1.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  {tr(locale, '条件', 'Criterion')}
                </th>
                <th className="py-1.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  {tr(locale, '新鲜度', 'Fresh')}
                </th>
                <th className="py-1.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  {tr(locale, '有效', 'Valid')}
                </th>
                <th className="py-1.5 pr-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  {tr(locale, '结果', 'Result')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const selected = selectedEvidenceId === row.evidenceId
                const fresh = freshnessCell(locale, row.fresh)
                const interactiveProps = onSelectEvidence
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => onSelectEvidence(selected ? null : row.evidenceId),
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelectEvidence(selected ? null : row.evidenceId)
                        }
                      }
                    }
                  : {}
                return (
                  <tr
                    key={row.evidenceId}
                    aria-selected={selected}
                    {...interactiveProps}
                    className={onSelectEvidence ? 'cursor-pointer' : undefined}
                    title={tr(
                      locale,
                      `绑定 Criterion ${row.criterionId}；Subject 绑定：${row.subjectDigest}`,
                      `Bound to criterion ${row.criterionId}; subject binding: ${row.subjectDigest}`
                    )}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: selected ? 'var(--bg-tertiary)' : undefined
                    }}
                  >
                    <td className="py-1.5 pl-2 pr-3">
                      <code className="text-xs" style={{ color: 'var(--text-primary)' }}>{row.evidenceId}</code>
                    </td>
                    <td className="py-1.5 pr-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <code>{row.criterionId}</code>
                    </td>
                    <td className="py-1.5 pr-3 text-xs" style={{ color: fresh.color }}>{fresh.label}</td>
                    <td className="py-1.5 pr-3 text-xs" style={{ color: row.valid ? 'var(--verified)' : 'var(--failed)' }}>
                      {row.valid ? tr(locale, '有效', 'Valid') : tr(locale, '无效', 'Invalid')}
                    </td>
                    <td className="py-1.5 pr-2 text-xs font-medium" style={{ color: evidenceStatusColor(row.status) }}>
                      {evidenceStatusLabel(locale, row.status)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
