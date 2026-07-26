import AppShell from './components/layout/AppShell'
import Sidebar from './components/layout/Sidebar'
import MainPanel from './components/layout/MainPanel'
import TerminalPanel from './components/layout/TerminalPanel'
import StatusBar from './components/layout/StatusBar'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { TabProvider } from './contexts/TabContext'
import { TerminalLayoutProvider } from './contexts/TerminalLayoutContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { SidebarProvider } from './contexts/SidebarContext'

export default function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <WorkspaceProvider>
          <TabProvider>
            <TerminalLayoutProvider>
              <SidebarProvider>
                <AppShell
                sidebar={<Sidebar />}
                mainPanel={<MainPanel />}
                terminalPanel={<TerminalPanel />}
                statusBar={<StatusBar />}
              />
            </SidebarProvider>
          </TerminalLayoutProvider>
          </TabProvider>
        </WorkspaceProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}
