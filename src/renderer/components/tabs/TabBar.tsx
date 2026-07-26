import { useTabs } from '../../contexts/TabContext'
import { useLocale } from '../../contexts/LocaleContext'

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs()
  const { t } = useLocale()

  if (tabs.length === 0) return null

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.icon && <span className="text-[10px]">{tab.icon}</span>}
          <span>{tab.id === '__settings__' ? t('sidebar.settings') : tab.label}</span>
          {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
          <button
            className="tab-close ml-1"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
