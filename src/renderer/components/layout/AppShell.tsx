import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useView } from '../../contexts/ViewContext'
import { useTerminalLayout } from '../../contexts/TerminalLayoutContext'
import { useLocale } from '../../contexts/LocaleContext'
import { useSidebar } from '../../contexts/SidebarContext'
import type { DiagnosticReport } from '../../../shared/ipc-types'
import MainPanel from './MainPanel'
import Sidebar from './Sidebar'
import TerminalPanel from './TerminalPanel'
import StatusBar from './StatusBar'
import Rail from './Rail'
import TopBar from './TopBar'
import Inspector from './Inspector'
import VerificationWorkbench from '../editors/VerificationWorkbench'
import ReadyCheckPanel from '../editors/ReadyCheckPanel'
import DiagnosticsPanel from '../editors/DiagnosticsPanel'
import SettingsEditor from '../editors/SettingsEditor'

/** True while the given CSS media query matches. Used for responsive shell behavior. */
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

/**
 * Environment view: readiness checks + full diagnostics, stacked in a
 * scrollable, centered page container.
 */
function EnvironmentView() {
  const { t } = useLocale()
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])
  const [report, setReport] = useState<DiagnosticReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef(false)

  const run = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      const diag = await window.api.diagnostics.run()
      setReport(diag)
    } catch (err) {
      setError(tRef.current('diag.failed') + ': ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => { void run() }, [run])

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto w-full max-w-[1100px] space-y-6">
        <ReadyCheckPanel />
        <DiagnosticsPanel report={report} loading={loading} error={error} onRun={run} />
      </div>
    </div>
  )
}

export default function AppShell() {
  const { currentView, inspectorOpen, setInspectorOpen } = useView()
  const { layout, maximized } = useTerminalLayout()
  const { collapsed: sidebarCollapsed } = useSidebar()
  // Below ~1180px the Inspector becomes an overlay drawer instead of a column.
  const inspectorOverlay = useMediaQuery('(max-width: 1179px)')
  const [terminalHeight, setTerminalHeight] = useState(200)

  // Preserve the existing bottom-docked terminal drag-resize (80-600px).
  const handleTerminalResizeStart = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (layout === 'right' || maximized) return
    e.preventDefault()
    const startY = e.clientY
    const startHeight = terminalHeight
    const handleMouseMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      setTerminalHeight(Math.max(80, Math.min(600, startHeight + delta)))
    }
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const renderView = () => {
    switch (currentView) {
      case 'verification':
        return (
          <div className="h-full overflow-y-auto px-6 py-6">
            <div className="mx-auto w-full max-w-[1100px]">
              <VerificationWorkbench />
            </div>
          </div>
        )
      case 'environment':
        return <EnvironmentView />
      case 'settings':
        return <SettingsEditor />
      case 'workspace':
      default:
        // Default view — the existing file-tree Workspace Browser (Sidebar,
        // reusing the original component + WorkspaceContext data) beside the
        // tabbed panel (TabBar + WelcomeTab). Restores the pre-shell entry
        // points for Memory / Skills / Projects / Config.
        return (
          <div className="h-full flex overflow-hidden">
            <div
              className="flex-shrink-0 overflow-hidden"
              style={{ width: sidebarCollapsed ? 48 : 260, borderRight: '1px solid var(--border-color)' }}
            >
              <Sidebar />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <MainPanel />
            </div>
          </div>
        )
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* 3-zone row: Rail | center column | Inspector */}
      <div className="flex flex-1 min-h-0 relative">
        <Rail />

        {/* Center column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <TopBar />
          <div className={`flex-1 flex min-h-0 overflow-hidden ${layout === 'right' ? 'flex-row' : 'flex-col'}`}>
            {/* View body */}
            <div className={`flex-1 min-h-0 min-w-0 overflow-hidden ${maximized ? 'hidden' : ''}`}>
              {renderView()}
            </div>

            {/* Terminal (existing behavior preserved) */}
            {layout === 'right' ? (
              <>
                <div
                  className={`w-1 flex-shrink-0 cursor-col-resize ${maximized ? 'hidden' : ''}`}
                  style={{ background: 'var(--border-color)' }}
                />
                <div
                  data-terminal-panel
                  className={`${maximized ? 'flex-1 min-w-0' : 'w-1/2 min-w-[300px] max-w-[60%]'} flex-shrink-0 overflow-hidden`}
                  style={{ background: 'var(--bg-primary)' }}
                >
                  <TerminalPanel />
                </div>
              </>
            ) : (
              <>
                <div
                  className={`h-1 flex-shrink-0 cursor-row-resize ${maximized ? 'hidden' : ''}`}
                  style={{ background: 'var(--border-color)' }}
                  onMouseDown={handleTerminalResizeStart}
                />
                <div
                  data-terminal-panel
                  style={
                    maximized
                      ? { flex: '1 1 0%', minHeight: 0, borderTop: '1px solid var(--border-color)' }
                      : { height: terminalHeight, flexShrink: 0, borderTop: '1px solid var(--border-color)' }
                  }
                  className="overflow-hidden"
                >
                  <TerminalPanel />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Inspector: normal column, or overlay drawer below 1180px */}
        {inspectorOpen && !inspectorOverlay && <Inspector />}
        {inspectorOpen && inspectorOverlay && (
          <div className="absolute inset-0 z-40 flex" role="presentation">
            <div
              className="flex-1"
              style={{ background: 'rgba(0, 0, 0, 0.45)' }}
              onClick={() => setInspectorOpen(false)}
            />
            <Inspector overlay />
          </div>
        )}
      </div>

      {/* StatusBar spans the full width at the very bottom */}
      <StatusBar />
    </div>
  )
}
