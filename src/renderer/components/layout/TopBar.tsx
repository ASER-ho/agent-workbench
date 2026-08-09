import { useView } from '../../contexts/ViewContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useLocale } from '../../contexts/LocaleContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'

/** Display-safe basename of a path — never expose a full path. */
function workspaceBasename(root: string): string {
  if (!root) return ''
  return root.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />
    </svg>
  )
}

function PanelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M10 3v10" />
    </svg>
  )
}

export default function TopBar() {
  const { t, locale, setLocale } = useLocale()
  const { theme, toggleTheme } = useTheme()
  const { currentView, openPalette, inspectorOpen, toggleInspector } = useView()
  const { root } = useWorkspace()

  const viewLabel = t(`view.${currentView}`)
  const crumb = workspaceBasename(root)

  return (
    <header
      className="flex-shrink-0 flex items-center gap-3 px-3 sm:px-4"
      style={{ height: 'var(--topbar-height, 44px)', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}
    >
      {/* Brand block */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold select-none"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          AW
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold whitespace-nowrap truncate" style={{ color: 'var(--text-primary)' }}>
            {t('app.name')}
          </span>
          <span className="hidden md:inline text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
            / {viewLabel}
          </span>
        </div>
      </div>

      {/* Workspace crumb — basename only */}
      {crumb && (
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{crumb}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={openPalette}
          title={t('topbar.search')}
          className="flex items-center gap-1.5 h-7 px-2 rounded-md transition-colors hover:bg-gray-800"
          style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <SearchIcon />
          <span className="hidden md:inline text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>Ctrl K</span>
        </button>

        <button
          onClick={toggleTheme}
          title={t('topbar.theme')}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-gray-800"
          style={{ color: 'var(--text-secondary)' }}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <button
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          title={locale === 'zh' ? t('settings.english') : t('settings.chinese')}
          className="flex items-center justify-center h-7 px-2 rounded-md transition-colors hover:bg-gray-800"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span className="text-[10px] font-medium whitespace-nowrap">{t('topbar.langToggle')}</span>
        </button>

        <button
          onClick={toggleInspector}
          title={t('topbar.inspector')}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-gray-800"
          style={{ color: inspectorOpen ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          <PanelIcon />
        </button>
      </div>
    </header>
  )
}
