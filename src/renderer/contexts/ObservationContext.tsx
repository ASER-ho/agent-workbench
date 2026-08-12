import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AutoVerifySettings, ObservedAgentEvent, ObservedSession, ObservationStatus, HookPreviewResult } from '../../shared/observation-types'

interface ObservationContextValue {
  status: ObservationStatus | null
  sessions: ObservedSession[]
  lastReceipt: unknown
  refresh: () => Promise<void>
  enable: () => Promise<void>
  disable: () => Promise<void>
  installHooksPreview: () => Promise<HookPreviewResult>
  confirmInstallHooks: () => Promise<{ ok: boolean; backupPath: string | null; reason?: string }>
  uninstallHooks: () => Promise<{ ok: boolean; restored: boolean }>
  setAutoVerify: (settings: AutoVerifySettings) => Promise<void>
}

const ObservationContext = createContext<ObservationContextValue | null>(null)

export function ObservationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ObservationStatus | null>(null)
  const [sessions, setSessions] = useState<ObservedSession[]>([])
  const [lastReceipt, setLastReceipt] = useState<unknown>(null)

  const refresh = useCallback(async () => {
    const s = await window.api.observation.status()
    setStatus(s)
    setSessions(s.activeSessions)
  }, [])

  useEffect(() => {
    void refresh()
    const offSessions = window.api.observation.onSessionUpdated((next) => setSessions(next))
    const offReceipt = window.api.observation.onVerificationCompleted((r) => setLastReceipt(r))
    const offEvent = window.api.observation.onEvent((_e: ObservedAgentEvent) => { /* keep subscription warm */ })
    return () => { offSessions(); offReceipt(); offEvent() }
  }, [refresh])

  const value: ObservationContextValue = {
    status,
    sessions,
    lastReceipt,
    refresh,
    enable: async () => { await window.api.observation.enable(); await refresh() },
    disable: async () => { await window.api.observation.disable(); await refresh() },
    installHooksPreview: () => window.api.observation.installHooksPreview(),
    confirmInstallHooks: async () => { const r = await window.api.observation.confirmInstallHooks(); await refresh(); return r },
    uninstallHooks: async () => { const r = await window.api.observation.uninstallHooks(); await refresh(); return r },
    setAutoVerify: async (settings) => { await window.api.observation.setAutoVerify(settings); await refresh() }
  }

  return <ObservationContext.Provider value={value}>{children}</ObservationContext.Provider>
}

export function useObservation(): ObservationContextValue {
  const ctx = useContext(ObservationContext)
  if (!ctx) throw new Error('useObservation must be used within ObservationProvider')
  return ctx
}
