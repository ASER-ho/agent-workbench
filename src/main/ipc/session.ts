import { app, type BrowserWindow } from 'electron'
import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { AgentSessionManager } from '../services/agent-session'

let sessionManager: AgentSessionManager | null = null
let quitAfterCleanup = false
let quitCleanupStarted = false

export interface AdditionalAppLifecycle {
  isActive: () => boolean
  dispose: () => Promise<void>
}

export function registerSessionHandlers(
  getMainWindow: () => BrowserWindow | null,
  additionalLifecycle?: AdditionalAppLifecycle
): AgentSessionManager {
  if (sessionManager) return sessionManager

  const manager = new AgentSessionManager({
    fixtureMarker: process.env['AGENT_WORKBENCH_FIXTURE_ROOT'] ?? 'agent-workbench-stub'
  })
  sessionManager = manager

  manager.onData((data) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.SESSION_DATA, { data })
  })
  manager.onStatus((snapshot) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.SESSION_STATUS_EVENT, snapshot)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_READINESS, (_event, input: { workspaceLabel: string; confirmationId?: string }) =>
    manager.getReadiness(input)
  )
  ipcMain.handle(IPC_CHANNELS.SESSION_PREPARE, (_event, input: { workspaceLabel: string }) =>
    manager.prepareLaunch(input)
  )
  ipcMain.handle(IPC_CHANNELS.SESSION_START, (_event, input: { confirmationId: string }) =>
    manager.start(input.confirmationId)
  )
  ipcMain.handle(IPC_CHANNELS.SESSION_INPUT, async (_event, input: { text: string }) => {
    await manager.input(input.text)
    return { success: true as const }
  })
  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, () => manager.stop())
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_STATUS, () => manager.getSnapshot())

  app.on('before-quit', (event) => {
    if (quitAfterCleanup || quitCleanupStarted) return
    const active = ['starting', 'running', 'stopping'].includes(manager.getSnapshot().status) || Boolean(additionalLifecycle?.isActive())
    if (!active) return
    event.preventDefault()
    quitCleanupStarted = true
    void Promise.all([manager.dispose(), additionalLifecycle?.dispose() ?? Promise.resolve()]).finally(() => {
      quitAfterCleanup = true
      app.quit()
    })
  })

  return manager
}
