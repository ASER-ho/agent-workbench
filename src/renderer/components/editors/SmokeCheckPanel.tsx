import { useLocale } from '../../contexts/LocaleContext'

// Checklist structure — labels resolved at render time via t()
type SectionKey = 'welcome' | 'capsule' | 'readiness' | 'launch' | 'terminal' | 'sidebar' | 'settings' | 'statusBar'

interface SmokeSection {
  key: SectionKey
  items: string[]
}

function buildChecklist(t: (k: string) => string): SmokeSection[] {
  return [
    { key: 'welcome', items: [
      t('smoke.welcomeItem1'), t('smoke.welcomeItem2'), t('smoke.welcomeItem3'),
      t('smoke.welcomeItem4'), t('smoke.welcomeItem5'), t('smoke.welcomeItem6')
    ]},
    { key: 'capsule', items: [
      t('smoke.capsuleItem1'), t('smoke.capsuleItem2'), t('smoke.capsuleItem3'),
      t('smoke.capsuleItem4'), t('smoke.capsuleItem5')
    ]},
    { key: 'readiness', items: [
      t('smoke.readinessItem1'), t('smoke.readinessItem2'), t('smoke.readinessItem3'), t('smoke.readinessItem4')
    ]},
    { key: 'launch', items: [
      t('smoke.launchItem1'), t('smoke.launchItem2'), t('smoke.launchItem3'),
      t('smoke.launchItem4'), t('smoke.launchItem5')
    ]},
    { key: 'terminal', items: [
      t('smoke.terminalItem1'), t('smoke.terminalItem2'), t('smoke.terminalItem3'),
      t('smoke.terminalItem4'), t('smoke.terminalItem5')
    ]},
    { key: 'sidebar', items: [
      t('smoke.sidebarItem1'), t('smoke.sidebarItem2'), t('smoke.sidebarItem3'), t('smoke.sidebarItem4')
    ]},
    { key: 'settings', items: [
      t('smoke.settingsItem1'), t('smoke.settingsItem2'), t('smoke.settingsItem3'), t('smoke.settingsItem4')
    ]},
    { key: 'statusBar', items: [
      t('smoke.statusBarItem1'), t('smoke.statusBarItem2')
    ]}
  ]
}

const SECTION_LABEL_KEYS: Record<SectionKey, string> = {
  welcome: 'smoke.welcome', capsule: 'smoke.capsule', readiness: 'smoke.readiness',
  launch: 'smoke.launch', terminal: 'smoke.terminal', sidebar: 'smoke.sidebar',
  settings: 'smoke.settings', statusBar: 'smoke.statusBar'
}

export default function SmokeCheckPanel() {
  const { t } = useLocale()
  const checklist = buildChecklist(t)

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{'\u{1F4CB}'}</span>
          <h3 className="text-sm font-semibold text-gray-200">{t('smoke.title')}</h3>
          <span className="text-[10px] text-yellow-500/80 bg-yellow-950/40 px-1.5 py-0.5 rounded">{t('smoke.manual')}</span>
        </div>
        <span className="text-[10px] text-gray-600">{t('smoke.pending')}</span>
      </div>

      <div className="px-4 py-2 bg-yellow-950/20 border-b border-yellow-900/30">
        <p className="text-[10px] text-yellow-400/60">{'\u{26A0}'} {t('smoke.notExecuted')}</p>
      </div>

      <div className="px-4 py-3 space-y-4">
        {checklist.map(section => (
          <div key={section.key}>
            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t(SECTION_LABEL_KEYS[section.key])}</h4>
            <div className="space-y-1">
              {section.items.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 w-4 text-center flex-shrink-0 text-gray-600">{'☐'}</span>
                  <span className="text-gray-500">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 bg-gray-950/60 border-t border-gray-800">
        <p className="text-[9px] text-gray-600 leading-relaxed">{t('smoke.footer')}</p>
      </div>
    </div>
  )
}
