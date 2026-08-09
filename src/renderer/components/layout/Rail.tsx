import { useEffect, useState, type ReactNode } from 'react'
import { useView, type AppView } from '../../contexts/ViewContext'
import { useLocale } from '../../contexts/LocaleContext'

const COLLAPSED_WIDTH = 52

/** True while the given CSS media query matches. Used for the responsive auto-collapse. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function WorkspaceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  )
}

function VerificationIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8.2 7.2 9.9 10.6 6.4" />
    </svg>
  )
}

function EnvironmentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 10.5a6.5 6.5 0 1 1 11 0" />
      <path d="M8 10.5 10.5 7" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" />
    </svg>
  )
}

function CollapseChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3 5 8l5 5" />
    </svg>
  )
}

function ExpandChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3l5 5-5 5" />
    </svg>
  )
}

const NAV_ITEMS: Array<{ view: AppView; labelKey: string; icon: ReactNode }> = [
  { view: 'workspace', labelKey: 'rail.workspace', icon: <WorkspaceIcon /> },
  { view: 'verification', labelKey: 'rail.verification', icon: <VerificationIcon /> },
  { view: 'environment', labelKey: 'rail.environment', icon: <EnvironmentIcon /> },
  { view: 'settings', labelKey: 'rail.settings', icon: <SettingsIcon /> }
]

export default function Rail() {
  const { t } = useLocale()
  const { currentView, navigate, railCollapsed, toggleRail } = useView()
  // Below ~820px the rail auto-collapses to the collapsed width (no hover-expand).
  const isVeryNarrow = useMediaQuery('(max-width: 819px)')
  const collapsed = railCollapsed || isVeryNarrow
  const railWidth = collapsed ? COLLAPSED_WIDTH : 'var(--nav-width, 200px)'

  return (
    <nav
      className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{ width: railWidth, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}
      aria-label="Primary"
    >
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        {NAV_ITEMS.map(item => {
          const active = currentView === item.view
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => navigate(item.view)}
              title={collapsed ? t(item.labelKey) : undefined}
              aria-current={active ? 'page' : undefined}
              className="relative w-full flex items-center transition-colors"
              style={{
                height: 40,
                padding: collapsed ? '0' : '0 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: active ? 'var(--bg-hover)' : 'transparent'
              }}
            >
              {active && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: 'var(--accent)' }} />
              )}
              <span
                className="flex-shrink-0 flex items-center justify-center"
                style={{ width: 20, color: active ? 'var(--accent)' : undefined }}
              >
                {item.icon}
              </span>
              {!collapsed && <span className="ml-2.5 text-xs font-medium truncate">{t(item.labelKey)}</span>}
            </button>
          )
        })}
      </div>

      {/* Collapse / expand toggle — click only, no hover-expand */}
      <div className="flex-shrink-0 p-1.5" style={{ borderTop: '1px solid var(--border-color)' }}>
        <button
          type="button"
          onClick={toggleRail}
          title={collapsed ? t('rail.expand') : t('rail.collapse')}
          className="w-full flex items-center justify-center rounded transition-colors hover:bg-gray-800"
          style={{ height: 32, color: 'var(--text-secondary)' }}
        >
          {collapsed ? <ExpandChevron /> : <CollapseChevron />}
          {!collapsed && <span className="ml-2 text-xs">{t('rail.collapse')}</span>}
        </button>
      </div>
    </nav>
  )
}
