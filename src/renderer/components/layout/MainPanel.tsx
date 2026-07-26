import { useTabs } from '../../contexts/TabContext'
import TabBar from '../tabs/TabBar'
import WelcomeTab from '../tabs/WelcomeTab'
import MarkdownEditor from '../editors/MarkdownEditor'
import SkillViewer from '../editors/SkillViewer'
import SettingsEditor from '../editors/SettingsEditor'

export default function MainPanel() {
  const { tabs, activeTabId } = useTabs()
  const activeTab = tabs.find(t => t.id === activeTabId)

  const renderContent = () => {
    if (!activeTab) {
      return <WelcomeTab />
    }

    switch (activeTab.fileType) {
      case 'memory':
        return <MarkdownEditor key={activeTab.id} filePath={activeTab.filePath} />
      case 'skill':
        return <SkillViewer key={activeTab.id} filePath={activeTab.filePath} />
      case 'claude-md':
        return <MarkdownEditor key={activeTab.id} filePath={activeTab.filePath} />
      case 'settings':
        return <SettingsEditor key={activeTab.id} />
      case 'transcript':
        return <MarkdownEditor key={activeTab.id} filePath={activeTab.filePath} />
      default:
        return <WelcomeTab />
    }
  }

  return (
    <div className="h-full flex flex-col">
      <TabBar />
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  )
}
