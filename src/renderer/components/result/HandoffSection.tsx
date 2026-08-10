// Handoff — consumes the existing real Markdown Handoff renderer.
// The Markdown is produced by renderHandoffMarkdown() from the immutable Receipt,
// exactly as the Main export service does. No new handoff semantics are generated
// here, and no fake handoff is rendered when a real Receipt is not available.

import { renderHandoffMarkdown } from '../../../shared/handoff-markdown'
import type { VerificationReceipt } from '../../../shared/verification-receipt-types'
import type { ResultLocale } from './result-types'
import { tr } from './result-shared'

interface HandoffSectionProps {
  locale?: ResultLocale
  receipt?: VerificationReceipt | null
}

export default function HandoffSection({ locale, receipt }: HandoffSectionProps) {
  return (
    <section aria-label={tr(locale, 'Markdown 交接', 'Markdown handoff')}>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        {tr(locale, 'Markdown 交接', 'Markdown handoff')}
      </h3>
      {receipt ? (
        <pre
          className="max-h-80 overflow-auto rounded-md border p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words"
          style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        >
          {renderHandoffMarkdown(receipt)}
        </pre>
      ) : (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {tr(
            locale,
            'Markdown Handoff 由不可变 Receipt 在导出时生成。完成验证并导出后，此处会显示真实的交接文档。',
            'The Markdown Handoff is generated from the immutable Receipt at export time. After verification and export, the real handoff document appears here.'
          )}
        </p>
      )}
    </section>
  )
}
