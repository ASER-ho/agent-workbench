import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useTerminalLayout } from '../../contexts/TerminalLayoutContext'
import { useLocale } from '../../contexts/LocaleContext'
import type { SessionLaunchPlan, SessionSnapshot } from '../../../shared/session-types'
import ContextMenu from '../../components/common/ContextMenu'
import type { ContextMenuItem } from '../../components/common/ContextMenu'
import ControlledActionPanel from './ControlledActionPanel'
import '@xterm/xterm/css/xterm.css'

const ACTIVE_STATUSES = new Set(['starting', 'running', 'stopping'])

export default function TerminalPanel() {
  const { layout, toggleLayout, maximized, toggleMaximized, setMaximized, setLayout } = useTerminalLayout()
  const { t } = useLocale()
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null)
  const [workspaceLabel, setWorkspaceLabel] = useState('')
  const [launchPlan, setLaunchPlan] = useState<SessionLaunchPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState('')
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; selection: string } | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputBufferRef = useRef('')
  const snapshotRef = useRef<SessionSnapshot | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => { snapshotRef.current = snapshot }, [snapshot])

  useEffect(() => {
    let disposed = false
    const refreshWorkspace = async () => {
      try {
        const capsule = await window.api.capsule.load()
        if (disposed) return
        const label = capsule.capsule.safePathLabel
        setWorkspaceLabel(label === '(not set)' ? '' : label)
      } catch {
        if (!disposed) setErrorKey('session.loadFailed')
      }
    }
    void window.api.session.getStatus()
      .then(status => { if (!disposed) setSnapshot(status) })
      .catch(() => { if (!disposed) setErrorKey('session.loadFailed') })
    void refreshWorkspace()
    const handleCapsuleUpdated = () => { void refreshWorkspace() }
    window.addEventListener('agent-workbench:capsule-updated', handleCapsuleUpdated)
    return () => {
      disposed = true
      window.removeEventListener('agent-workbench:capsule-updated', handleCapsuleUpdated)
    }
  }, [])

  useEffect(() => {
    const unsubscribeData = window.api.session.onData(data => terminalRef.current?.write(data.replace(/\n/g, '\r\n')))
    const unsubscribeStatus = window.api.session.onStatus(next => {
      setSnapshot(next)
      if (!ACTIVE_STATUSES.has(next.status)) setBusy(false)
    })
    return () => { unsubscribeData(); unsubscribeStatus() }
  }, [])

  const copySelectionFromTerm = (term: Terminal): boolean => {
    const selection = term.getSelection()
    if (!selection) return false
    void navigator.clipboard.writeText(selection)
    return true
  }

  const sendInput = useCallback(async (value: string) => {
    const text = value.replace(/[\r\n]+/g, ' ').trim()
    if (!text || snapshotRef.current?.status !== 'running') return
    setErrorKey('')
    try { await window.api.session.input(text) } catch { setErrorKey('session.inputFailed') }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const term = new Terminal({
      cursorBlink: true, cursorStyle: 'block', fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: { background: '#0d0d1a', foreground: '#e2e8f0', cursor: '#f8fafc', selectionBackground: '#334155', black: '#1e293b', red: '#f87171', green: '#4ade80', yellow: '#facc15', blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#f8fafc' },
      allowTransparency: true, rows: 10, cols: 80
    })
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== 'keydown') return true
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c') return !copySelectionFromTerm(term)
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'c' && copySelectionFromTerm(term)) return false
      return true
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon); fitAddonRef.current = fitAddon; term.open(containerRef.current)
    term.writeln('\x1b[90mAgent Workbench \u2022 deterministic stub session\x1b[0m')
    term.writeln('\x1b[90mNo real credentials or paid API requests are used.\x1b[0m'); term.writeln('')
    term.onData(data => {
      if (snapshotRef.current?.status !== 'running') return
      if (data === '\r') { const value = inputBufferRef.current; inputBufferRef.current = ''; term.write('\r\n'); void sendInput(value) }
      else if (data === '\u007f') { if (inputBufferRef.current) { inputBufferRef.current = inputBufferRef.current.slice(0, -1); term.write('\b \b') } }
      else if (data >= ' ') { inputBufferRef.current += data; term.write(data) }
    })
    terminalRef.current = term
    setTimeout(() => { try { fitAddon.fit() } catch {} }, 100)
    return () => { term.dispose(); terminalRef.current = null }
  }, [sendInput])

  useEffect(() => { const timer = setTimeout(() => { try { fitAddonRef.current?.fit() } catch {} }, 150); return () => clearTimeout(timer) }, [layout, maximized])

  useEffect(() => {
    if (!launchPlan) return
    confirmButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); setLaunchPlan(null); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
      if (focusable.length < 2) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [launchPlan, busy])

  const reviewLaunch = async () => { setBusy(true); setErrorKey(''); try { setLaunchPlan(await window.api.session.prepareLaunch(workspaceLabel)) } catch { setErrorKey('session.prepareFailed') } finally { setBusy(false) } }
  const confirmLaunch = async () => {
    if (!launchPlan) return
    setBusy(true); setErrorKey('')
    try { setSnapshot(await window.api.session.start(launchPlan.confirmationId)); setLaunchPlan(null); terminalRef.current?.focus() }
    catch { setErrorKey('session.startFailed'); setLaunchPlan(null) }
    finally { setBusy(false) }
  }
  const stopSession = async () => { setBusy(true); setErrorKey(''); try { setSnapshot(await window.api.session.stop()) } catch { setErrorKey('session.stopFailed') } finally { setBusy(false) } }
  const handlePaste = async () => { if (snapshotRef.current?.status !== 'running') return; try { await sendInput(await navigator.clipboard.readText()) } catch { setErrorKey('session.inputFailed') } }

  const status = snapshot?.status ?? 'stopped'
  const active = ACTIVE_STATUSES.has(status)
  const canReview = Boolean(workspaceLabel) && !active && !busy
  const statusTone = status === 'running' ? 'text-green-300' : status === 'crashed' || status === 'timed_out' || status === 'error' ? 'text-red-300' : 'text-slate-300'

  return (
    <div className="h-full flex flex-col" aria-label={t('session.shell')}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-950 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!maximized && <button onClick={toggleLayout} className="btn btn-ghost min-h-9 px-2 focus-visible:ring-2 focus-visible:ring-blue-400" title={layout === 'bottom' ? t('terminal.switchRight') : t('terminal.switchBottom')}>{layout === 'bottom' ? '\u2191' : '\u2193'}</button>}
          <button onClick={toggleMaximized} className="btn btn-ghost min-h-9 px-2 focus-visible:ring-2 focus-visible:ring-blue-400" title={maximized ? t('terminal.exitFullscreen') : t('terminal.fullscreen')}>{maximized ? '\u2212' : '\u25a1'}</button>
          {maximized && <button onClick={() => { setMaximized(false); setLayout('right') }} className="btn btn-ghost min-h-9 px-2 focus-visible:ring-2 focus-visible:ring-blue-400" title={t('terminal.dockSide')}>{'\u25b6'}</button>}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">{t('session.shell')}</div>
            <div className="text-[11px] text-slate-400 truncate">{workspaceLabel || t('session.workspaceMissing')} {'\u2022'} {snapshot?.providerLabel ?? 'Local Stub'} {'\u2022'} {snapshot?.modelLabel ?? 'deterministic-v1'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className={'text-xs font-medium ' + statusTone}>{t('session.status.' + status)}</span>
          {status === 'running'
            ? <button onClick={stopSession} disabled={busy} className="min-h-9 px-3 rounded border border-red-500/70 text-red-200 hover:bg-red-950 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-400">{t('session.stop')}</button>
            : <button onClick={reviewLaunch} disabled={!canReview} className="min-h-9 px-3 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-300">{busy ? t('session.preparing') : t('session.reviewLaunch')}</button>}
        </div>
      </div>

      {errorKey && <div role="alert" className="px-3 py-2 text-xs text-red-100 bg-red-950 border-b border-red-800">{t(errorKey)} {t('session.retryHint')}</div>}
      <div className="flex-1 overflow-hidden bg-[#0d0d1a] relative" onContextMenu={(event) => { event.preventDefault(); setMenuPos({ x: event.clientX, y: event.clientY, selection: terminalRef.current?.getSelection() || '' }) }}>
        <div ref={containerRef} className="absolute inset-0" />
        {!active && status !== 'running' && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="max-w-sm rounded-lg border border-slate-700 bg-slate-950/95 p-4 text-center shadow-xl">
              <div className="text-sm font-semibold text-slate-100">{t('session.emptyTitle')}</div>
              <div className="mt-1 text-xs leading-5 text-slate-400">{workspaceLabel ? t('session.emptyReady') : t('session.workspaceHelp')}</div>
            </div>
          </div>
        )}
      </div>

      <ControlledActionPanel snapshot={snapshot} workspaceLabel={workspaceLabel} />

      {launchPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="session-confirm-title" aria-describedby="session-confirm-risk" className="w-full max-w-lg rounded-xl border border-slate-600 bg-slate-950 p-5 shadow-2xl">
            <h2 id="session-confirm-title" className="text-base font-semibold text-white">{t('session.confirmTitle')}</h2>
            <p className="mt-1 text-sm text-slate-300">{t('session.confirmIntro')}</p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm">
              <dt className="text-slate-400">{t('session.workspace')}</dt><dd className="text-slate-100 break-all">{launchPlan.workspaceLabel}</dd>
              <dt className="text-slate-400">{t('session.agent')}</dt><dd className="text-slate-100">{launchPlan.agentLabel}</dd>
              <dt className="text-slate-400">Provider</dt><dd className="text-slate-100">{launchPlan.providerLabel}</dd>
              <dt className="text-slate-400">Model</dt><dd className="text-slate-100">{launchPlan.modelLabel}</dd>
              <dt className="text-slate-400">{t('session.executable')}</dt><dd className="font-mono text-slate-100">{launchPlan.executableBasename}</dd>
            </dl>
            <div id="session-confirm-risk" className="mt-4 rounded-lg border border-amber-700/70 bg-amber-950/40 p-3 text-sm text-amber-100">
              <div className="font-medium">{t('session.riskTitle')}</div>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-xs leading-5">
                <li>{t('session.riskWorkspace')}</li><li>{t('session.riskProcess')}</li><li>{t('session.riskStop')}</li><li>{t('session.riskStub')}</li>
              </ul>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setLaunchPlan(null)} disabled={busy} className="min-h-10 px-4 rounded border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-300">{t('session.cancel')}</button>
              <button ref={confirmButtonRef} onClick={confirmLaunch} disabled={busy} className="min-h-10 px-4 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-300">{busy ? t('session.starting') : t('session.confirmStart')}</button>
            </div>
          </div>
        </div>
      )}

      {menuPos && (() => {
        const items: ContextMenuItem[] = [
          { label: t('terminal.copy'), icon: 'C', shortcut: 'Ctrl+C', disabled: !menuPos.selection, onClick: () => { if (terminalRef.current) copySelectionFromTerm(terminalRef.current) } },
          { label: t('terminal.paste'), icon: 'P', shortcut: 'Ctrl+V', disabled: status !== 'running', onClick: handlePaste },
          { label: t('terminal.clear'), icon: '\u232b', disabled: false, onClick: () => terminalRef.current?.clear() }
        ]
        return <ContextMenu x={menuPos.x} y={menuPos.y} items={items} onClose={() => setMenuPos(null)} />
      })()}
    </div>
  )
}
