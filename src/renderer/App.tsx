import AppShell from './components/layout/AppShell'
import CommandPalette from './components/overlays/CommandPalette'
import { ViewProvider } from './contexts/ViewContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { TabProvider } from './contexts/TabContext'
import { TerminalLayoutProvider } from './contexts/TerminalLayoutContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { DensityProvider } from './contexts/DensityContext'
import { SidebarProvider } from './contexts/SidebarContext'

export default function App() {
  return (
    <ThemeProvider>
      <DensityProvider>
        <LocaleProvider>
          <WorkspaceProvider>
            <TabProvider>
              <TerminalLayoutProvider>
                <SidebarProvider>
                  <ViewProvider>
                    <AppShell />
                    <CommandPalette />
                  </ViewProvider>
                </SidebarProvider>
              </TerminalLayoutProvider>
            </TabProvider>
          </WorkspaceProvider>
        </LocaleProvider>
      </DensityProvider>
    </ThemeProvider>
  )
}
