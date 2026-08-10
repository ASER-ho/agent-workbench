// Changes / Subject surface — compact list, never a card wall.
// Consumes real subject binding information from the execution result and real
// unresolved items from the Receipt. Long values (digests, Windows paths) are
// middle-truncated in the cell while the full value stays visible via title.

import type { ResultLocale } from './result-types'
import { tr, truncateMiddle } from './result-shared'

export interface ChangeItem {
  id: string
  label: { zh: string; en: string }
  value: string
  title?: string
  tone?: 'ok' | 'warn' | 'muted'
}

interface ChangesListProps {
  items: ChangeItem[]
  locale?: ResultLocale
}

function toneColor(tone: ChangeItem['tone']): string {
  switch (tone) {
    case 'ok': return 'var(--verified)'
    case 'warn': return 'var(--warn)'
    default: return 'var(--text-secondary)'
  }
}

export default function ChangesList({ items, locale }: ChangesListProps) {
  if (items.length === 0) return null
  return (
    <section aria-label={tr(locale, '变更 / Subject', 'Changes / subject')}>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        {tr(locale, '变更 / Subject', 'Changes / subject')}
      </h3>
      <div className="max-h-64 overflow-auto rounded-md border" style={{ borderColor: 'var(--border-color)' }}>
        <table className="w-full min-w-[360px] border-collapse text-sm">
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td className="py-1.5 pl-2 pr-3 align-top text-xs" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                  {tr(locale, item.label.zh, item.label.en)}
                </td>
                <td className="py-1.5 pr-2 align-top">
                  <code
                    className="block text-xs"
                    style={{ color: toneColor(item.tone), wordBreak: 'break-all' }}
                    title={item.title ?? item.value}
                  >
                    {truncateMiddle(item.value, 48, 12)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
