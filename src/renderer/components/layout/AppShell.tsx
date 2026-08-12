import { useCallback, useEffect, useRef, useState } from 'react'
import { useView } from '../../contexts/ViewContext'
import { useLocale } from '../../contexts/LocaleContext'
import { useMediaQuery } from '../../lib/useMediaQuery'
import type { DiagnosticReport } from '../../../shared/ipc-types'
import StatusBar from './StatusBar'
import Rail from './Rail'
import TopBar from './TopBar'
import Inspector from './Inspector'
import WorkspaceDesk from '../views/WorkspaceDesk'
import VerificationWorkbench from '../editors/VerificationWorkbench'
import ReadyCheckPanel from '../editors/ReadyCheckPanel'
import DiagnosticsPanel from '../editors/DiagnosticsPanel'
import SettingsEditor from '../editors/SettingsEditor'

/**
 * Environment view: readiness checks + full diagnostics, stacked in a
 * scrollable, centered page container. Core expression is Workspace / Node /
 * Git / Verification readiness / Execution boundary; agent-specific detector
 * appears only as an advanced diagnostic item (never a top-level setting).
 */
/** Real, per-item "what to check next" hints for failed diagnostics (renderer-only, no auto-repair). */
function diagnosticsNextSteps(report: DiagnosticReport): { id: string; hintKey: string }[] {
  const out: { id: string; hintKey: string }[] = []
  for (const item of report.items) {
    if (item.status !== 'error') continue
    const id = item.id
    let hintKey: string
    if (id === 'node-path' || id === 'node-version' || id.startsWith('node-')) hintKey = 'diag.next.node'
    else if (id === 'npm-path' || id === 'npm-version' || id.startsWith('npm')) hintKey = 'diag.next.npm'
    else if (id.startsWith('git')) hintKey = 'diag.next.git'
    else if (id.startsWith('claude')) hintKey = 'diag.next.claude'
    else hintKey = 'diag.next.generic'
    out.push({ id, hintKey })
  }
  return out
}

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

  const nextSteps = report ? diagnosticsNextSteps(report) : []

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto w-full max-w-[1100px] space-y-6">
        <ReadyCheckPanel />
        {nextSteps.length > 0 && (
          <div
            className="rounded-md border p-3 text-xs"
            style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}
          >
            <div className="font-semibold" style={{ color: 'var(--warn)' }}>
              {t('diag.next.title')}
            </div>
            <ul className="mt-1.5 space-y-1" style={{ color: 'var(--text-secondary)' }}>
              {nextSteps.map(s => (
                <li key={s.id}>• {s.id}：{t(s.hintKey)}</li>
              ))}
            </ul>
          </div>
        )}
        <DiagnosticsPanel report={report} loading={loading} error={error} onRun={run} />
      </div>
    </div>
  )
}

export default function AppShell() {
  const { currentView, inspectorOpen, setInspectorOpen, setInspectorOpenResponsive, inspectorUserToggled } = useView()
  // Below ~1180px the Inspector becomes an overlay drawer instead of a column.
  const inspectorOverlay = useMediaQuery('(max-width: 1179px)')

  // Responsive Inspector default: on desktop the Inspector is open by default;
  // crossing into the narrow (<1180px) range must safely close a merely-default
  // open Inspector so its overlay scrim never blocks the Rail/Main. The user's
  // explicit toggle wins and is preserved across the boundary. No duplicate
  // Inspector state system — this reuses ViewContext's inspectorOpen.
  const wasOverlayRef = useRef(inspectorOverlay)
  useEffect(() => {
    if (inspectorOverlay && !wasOverlayRef.current && !inspectorUserToggled) {
      setInspectorOpenResponsive(false)
    } else if (!inspectorOverlay && wasOverlayRef.current && !inspectorUserToggled) {
      setInspectorOpenResponsive(true)
    }
    wasOverlayRef.current = inspectorOverlay
  }, [inspectorOverlay, inspectorUserToggled, setInspectorOpenResponsive])

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
        // Workspace home = the Project Desk (self-contained; no file browser).
        return (
          <div className="h-full relative overflow-hidden">
            <WorkspaceDesk />
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
