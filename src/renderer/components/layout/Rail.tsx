import { type ReactNode } from 'react'
import { useView, type AppView } from '../../contexts/ViewContext'
import { useLocale } from '../../contexts/LocaleContext'
import { useMediaQuery } from '../../lib/useMediaQuery'
import {
  WorkspaceIcon, VerificationIcon, EnvironmentIcon, SettingsIcon,
  CollapseChevron, ExpandChevron
} from '../common/icons'

const COLLAPSED_WIDTH = 52

const NAV_ITEMS: Array<{ view: AppView; labelKey: string; icon: ReactNode }> = [
  { view: 'workspace', labelKey: 'rail.workspace', icon: <WorkspaceIcon size={16} /> },
  { view: 'verification', labelKey: 'rail.verification', icon: <VerificationIcon size={16} /> },
  { view: 'environment', labelKey: 'rail.environment', icon: <EnvironmentIcon size={16} /> },
  { view: 'settings', labelKey: 'rail.settings', icon: <SettingsIcon size={16} /> }
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
