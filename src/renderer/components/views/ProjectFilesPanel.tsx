import { useEffect } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import Sidebar from '../layout/Sidebar'

interface ProjectFilesPanelProps {
  /**
   * Whether the drawer is open. Optional: the shell may gate mounting with
   * `{projectFilesOpen && <ProjectFilesPanel … />}` and omit this prop, in
   * which case the panel renders whenever it is mounted. Pass `false` to
   * render `null` instead.
   */
  open?: boolean
  onClose: () => void
}

/**
 * Project Files — on-demand file browser drawer.
 *
 * Reuses the legacy `Sidebar` component so ALL file capabilities are preserved
 * (browse, expand dirs, open files, create, rename, delete, refresh) without
 * duplication. The drawer is shown on demand and is never a permanent column —
 * the default workspace view is the Project Desk alone.
 */
export default function ProjectFilesPanel({ open, onClose }: ProjectFilesPanelProps) {
  const { locale } = useLocale()
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en)

  // Close the drawer on Escape while it is open.
  useEffect(() => {
    if (open === false) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (open === false) return null

  return (
    <div className="absolute inset-0 z-40 flex" role="presentation">
      {/* Scrim — closes the drawer on click */}
      <div
        className="flex-1"
        style={{ background: 'rgba(0, 0, 0, 0.45)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Left drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={tr('项目文件', 'Project Files')}
        className="flex-shrink-0 flex flex-col overflow-hidden"
        style={{
          width: 260,
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-color)',
          boxShadow: '10px 0 24px rgba(0, 0, 0, 0.25)'
        }}
      >
        <header
          className="flex-shrink-0 flex items-center justify-between h-10 px-3"
          style={{ borderBottom: '1px solid var(--border-color)' }}
        >
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {tr('项目文件', 'Project Files')}
          </span>
          <button
            type="button"
            onClick={onClose}
            title={tr('关闭', 'Close')}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-800"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        {/* Legacy file browser — manages its own scroll + contexts */}
        <div className="min-h-0 flex-1">
          <Sidebar />
        </div>
      </aside>
    </div>
  )
}
