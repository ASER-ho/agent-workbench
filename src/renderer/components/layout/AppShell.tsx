import { useCallback, useEffect, useRef, useState } from 'react'
import { useView } from '../../contexts/ViewContext'
import { useLocale } from '../../contexts/LocaleContext'
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
/** Real, per-item "what to check next" hints for failed diagnostics (renderer-only, no auto-repair). */
function diagnosticsNextSteps(report: DiagnosticReport, locale: 'zh' | 'en'): { id: string; hint: string }[] {
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en)
  const out: { id: string; hint: string }[] = []
  for (const item of report.items) {
    if (item.status !== 'error') continue
    const id = item.id
    let hint: string
    if (id === 'node-path' || id === 'node-version' || id.startsWith('node-')) hint = tr('检查 Node.js 是否安装并可从 PATH 访问', 'Check that Node.js is installed and reachable from PATH')
    else if (id === 'npm-path' || id === 'npm-version' || id.startsWith('npm')) hint = tr('检查 npm 是否安装并可用', 'Check that npm is installed and usable')
    else if (id.startsWith('git')) hint = tr('检查 Git 是否安装并可访问', 'Check that Git is installed and reachable')
    else if (id.startsWith('claude')) hint = tr('（可选）检测 Claude CLI；不影响验证', '(Optional) Claude CLI detection; does not affect verification')
    else hint = tr('检查该项配置后重新检测', 'Check this configuration and re-run detection')
    out.push({ id, hint })
  }
  return out
}

function EnvironmentView() {
  const { t, locale } = useLocale()
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en)
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

  const nextSteps = report ? diagnosticsNextSteps(report, locale) : []

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
              {tr('下一步检查', 'What to check next')}
            </div>
            <ul className="mt-1.5 space-y-1" style={{ color: 'var(--text-secondary)' }}>
              {nextSteps.map(s => (
                <li key={s.id}>• {s.id}：{s.hint}</li>
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
