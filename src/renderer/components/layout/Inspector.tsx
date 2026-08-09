import { useView } from '../../contexts/ViewContext'
import { useLocale } from '../../contexts/LocaleContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'

/** Display-safe basename of a path — never expose a full path. */
function workspaceBasename(root: string): string {
  if (!root) return ''
  return root.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
}

interface InspectorProps {
  /** When true, render as a right-side overlay drawer (used below ~1180px). */
  overlay?: boolean
}

/**
 * Generic Context Inspector shell for 0.1.2-A.
 * Full Evidence/Receipt inspector arrives in 0.1.2-B/C — this is intentionally
 * a basic container driven by the current view.
 */
export default function Inspector({ overlay = false }: InspectorProps) {
  const { t } = useLocale()
  const { currentView, setInspectorOpen } = useView()
  const { root } = useWorkspace()

  const renderBody = () => {
    switch (currentView) {
      case 'workspace': {
        const base = workspaceBasename(root)
        return (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {t('inspector.workspace')}
            </div>
            <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {base || t('common.none')}
            </div>
          </div>
        )
      }
      case 'verification':
        return (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('inspector.verificationHint')}
          </p>
        )
      case 'environment':
        return (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('inspector.environmentHint')}
          </p>
        )
      case 'settings':
        return (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('inspector.settingsHint')}
          </p>
        )
      default:
        return null
    }
  }

  return (
    <aside
      className={`${overlay ? 'h-full' : 'flex-shrink-0'} flex flex-col overflow-hidden`}
      style={{
        width: 'var(--inspector-width, 300px)',
        background: 'var(--bg-tertiary)',
        borderLeft: '1px solid var(--border-color)',
        boxShadow: overlay ? '-10px 0 24px rgba(0, 0, 0, 0.25)' : undefined
      }}
      aria-label={t('inspector.title')}
    >
      <header
        className="flex-shrink-0 flex items-center justify-between px-3 h-10"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {t('inspector.title')}
        </span>
        <button
          type="button"
          onClick={() => setInspectorOpen(false)}
          title={t('inspector.close')}
          className="flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-gray-800"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {renderBody()}
      </div>
    </aside>
  )
}
