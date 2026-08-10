import { useCallback, useEffect, useRef, useState } from 'react'
import { useView } from '../../contexts/ViewContext'
import { useLocale } from '../../contexts/LocaleContext'
import type { DiagnosticReport } from '../../../shared/ipc-types'
import StatusBar from './StatusBar'
import Rail from './Rail'
import TopBar from './TopBar'
import Inspector from './Inspector'
import WorkspaceDesk from '../views/WorkspaceDesk'
import ProjectFilesPanel from '../views/ProjectFilesPanel'
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
 * scrollable, centered page container. Core expression is Workspace / Node /
 * Git / Verification readiness / Execution boundary; agent-specific detector
 * appears only as an advanced diagnostic item (never a top-level setting).
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
  // Below ~1180px the Inspector becomes an overlay drawer instead of a column.
  const inspectorOverlay = useMediaQuery('(max-width: 1179px)')
  const [projectFilesOpen, setProjectFilesOpen] = useState(false)

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
        // Workspace home = the Project Desk, with the file browser available
        // on demand as a Project Files drawer (no permanent legacy sidebar).
        return (
          <div className="h-full relative overflow-hidden">
            <WorkspaceDesk
              projectFilesOpen={projectFilesOpen}
              onOpenProjectFiles={() => setProjectFilesOpen(true)}
              onCloseProjectFiles={() => setProjectFilesOpen(false)}
            />
            {projectFilesOpen && (
              <ProjectFilesPanel onClose={() => setProjectFilesOpen(false)} />
            )}
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
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            {renderView()}
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
