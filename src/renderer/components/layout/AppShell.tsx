import { useState, type ReactNode } from 'react'
import { useTerminalLayout } from '../../contexts/TerminalLayoutContext'
import { useSidebar } from '../../contexts/SidebarContext'

interface AppShellProps {
  sidebar: ReactNode
  mainPanel: ReactNode
  terminalPanel: ReactNode
  statusBar: ReactNode
}

export default function AppShell({ sidebar, mainPanel, terminalPanel, statusBar }: AppShellProps) {
  const { layout, maximized } = useTerminalLayout()
  const { collapsed } = useSidebar()
  const sidebarWidth = collapsed ? 48 : 260
  const [terminalHeight, setTerminalHeight] = useState(200)

  const handleTerminalResizeStart = () => {
    if (layout === 'right') return
    const startY = useState(0)[1] as number

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY
      setTerminalHeight(Math.max(80, Math.min(600, newHeight)))
    }
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className="h-full flex flex-col bg-gray-950">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div style={{ width: sidebarWidth }}
          className={`flex-shrink-0 bg-gray-900 border-r border-gray-800 overflow-hidden transition-all duration-200 ${maximized ? 'hidden' : ''}`}>
          <div className="h-full overflow-y-auto">
            {sidebar}
          </div>
        </div>

        {/* Main Content + Terminal */}
        <div className={`flex-1 flex ${layout === 'right' ? 'flex-row' : 'flex-col'} overflow-hidden`}>
          {/* Main Panel */}
          <div className={`flex-1 overflow-hidden ${maximized ? 'hidden' : ''}`}>
            {mainPanel}
          </div>

          {/* Terminal section */}
          {layout === 'right' ? (
            <>
              <div className={`w-1 bg-gray-800 cursor-col-resize hover:bg-indigo-600/50 transition-colors flex-shrink-0 ${maximized ? 'hidden' : ''}`} />
              <div data-terminal-panel className={`${maximized ? 'flex-1 min-w-0' : 'w-1/2 min-w-[300px] max-w-[60%]'} flex-shrink-0 bg-gray-950 overflow-hidden`}>
                {terminalPanel}
              </div>
            </>
          ) : (
            <>
              <div
                className={`h-1 bg-gray-800 cursor-row-resize hover:bg-indigo-600/50 transition-colors flex-shrink-0 ${maximized ? 'hidden' : ''}`}
                onMouseDown={handleTerminalResizeStart}
              />
              <div
                style={maximized ? undefined : { height: terminalHeight }}
                className={`${maximized ? 'flex-1' : 'flex-shrink-0'} bg-gray-950 border-t border-gray-800 overflow-hidden`}
              >
                {terminalPanel}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status Bar */}
      {statusBar}
    </div>
  )
}
