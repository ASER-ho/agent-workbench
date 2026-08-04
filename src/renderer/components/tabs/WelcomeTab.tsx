import { useState } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useTabs } from '../../contexts/TabContext'
import { useLocale } from '../../contexts/LocaleContext'
import ProjectCapsule from '../editors/ProjectCapsule'
import ReadyCheckPanel from '../editors/ReadyCheckPanel'
import LaunchConfirmation from '../editors/LaunchConfirmation'
import SmokeCheckPanel from '../editors/SmokeCheckPanel'
import VerificationWorkbench from '../editors/VerificationWorkbench'

const CARD_KEYS = [
  { section: 'Memory', icon: '📝', titleKey: 'welcome.memory', descKey: 'welcome.memoryDesc', fileType: 'memory' as const },
  { section: 'Skills', icon: '🧠', titleKey: 'welcome.skills', descKey: 'welcome.skillsDesc', fileType: 'skill' as const },
  { section: 'Projects', icon: '📁', titleKey: 'welcome.projects', descKey: 'welcome.projectsDesc', fileType: 'transcript' as const },
  { section: 'Config', icon: '⚙️', titleKey: 'welcome.settings', descKey: 'welcome.settingsDesc', fileType: 'settings' as const }
]

export default function WelcomeTab() {
  const { sections } = useWorkspace()
  const { openTab } = useTabs()
  const { t } = useLocale()
  const [opening, setOpening] = useState<string | null>(null)

  const handleCardClick = async (sectionName: string, fileType: 'memory' | 'skill' | 'transcript' | 'settings') => {
    const section = sections.find(s => s.name === sectionName)
    if (!section || section.items.length === 0) return

    setOpening(sectionName)

    try {
      let target = section.items.find(i => !i.isDirectory)
      if (!target) {
        const firstDir = section.items[0]
        const subItems = await window.api.fs.listDirectory(firstDir.path)
        target = subItems.find(i => !i.isDirectory) ?? null
        if (target) {
          openTab(target.path, target.name, fileType, sectionName === 'Skills' ? '🧠' : '📄')
        }
      } else {
        openTab(target.path, target.name, fileType, sectionName === 'Skills' ? '🧠' : '📄')
      }
    } catch {
      // silently fail
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className="flex flex-col items-center min-h-full gap-6 text-gray-500 pt-8 pb-24">
      <div className="text-6xl opacity-20">⚡</div>
      <h1 className="text-2xl font-semibold text-gray-400">{t('welcome.title')}</h1>
      <p className="text-sm text-gray-600 text-center max-w-md">
        {t('welcome.subtitle')}
      </p>

      {/* Read-only verification slice */}
      <div className="w-full max-w-2xl">
        <VerificationWorkbench />
      </div>

      {/* Project Capsule card */}
      <div className="w-full max-w-lg">
        <ProjectCapsule />
      </div>

      {/* Environment Readiness */}
      <div className="w-full max-w-lg">
        <ReadyCheckPanel />
      </div>

      {/* Agent Launch Confirmation */}
      <div className="w-full max-w-lg">
        <LaunchConfirmation />
      </div>

      {/* Smoke Checklist */}
      <div className="w-full max-w-lg">
        <SmokeCheckPanel />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
        {CARD_KEYS.map(card => {
          const section = sections.find(s => s.name === card.section)
          const hasItems = section && section.items.length > 0
          const isLoading = opening === card.section
          return (
            <button
              key={card.section}
              onClick={() => handleCardClick(card.section, card.fileType)}
              disabled={!hasItems || isLoading}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors text-left ${
                !hasItems
                  ? 'bg-gray-900/50 border-gray-800/50 cursor-not-allowed opacity-60'
                  : 'bg-gray-900 border-gray-800 hover:bg-gray-800 hover:border-gray-600 cursor-pointer'
              }`}
            >
              {isLoading ? (
                <span className="loading-spinner w-5 h-5" />
              ) : (
                <span className="text-lg">{card.icon}</span>
              )}
              <span className="text-gray-400 font-medium">{t(card.titleKey)}</span>
              <span className="text-gray-600 text-center leading-relaxed">{t(card.descKey)}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-700 mt-4">
        {t('welcome.hint')}
      </p>
    </div>
  )
}
