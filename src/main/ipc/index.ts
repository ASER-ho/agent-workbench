import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { registerFileHandlers } from './files'
import { registerTerminalHandlers } from './terminal'
import { registerProjectHandlers } from './projects'
import { registerSettingsHandlers } from './settings'
import { registerMaintenanceHandlers } from './maintenance'
import { registerApiHandlers } from './api'
import { registerPackageHandlers } from './package'
import { registerRuntimeHandlers } from './runtime'
import { registerCapsuleHandlers } from './capsule'
import { registerSessionHandlers } from './session'
import { registerActionHandlers } from './action'
import { registerWorkspaceHandlers } from '../services/workspace-foundation/workspace-ipc'
import { ClaudeProcessManager } from '../services/claude-process'
import { FileSecretStore } from '../services/secret-store'
import { setTrustedIpcWindow } from './trusted-ipc'

export function registerAllIpcHandlers(mainWindow: BrowserWindow): void {
  setTrustedIpcWindow(mainWindow)
  const processManager = new ClaudeProcessManager()

  registerFileHandlers()
  registerTerminalHandlers(() => mainWindow, processManager)
  registerProjectHandlers()
  registerSettingsHandlers()
  registerMaintenanceHandlers(() => processManager.getRuntimeProviderStatus())
  const _ss = new FileSecretStore({ storagePath: join(app.getPath('userData'), 'secrets.enc') })
  registerApiHandlers(_ss, processManager)
  registerPackageHandlers()
  processManager.setSecretResolver((ref) => _ss.getSecret(ref))
  registerRuntimeHandlers(processManager, { hasSecret: (ref) => _ss.hasSecret(ref) })
  registerCapsuleHandlers()
  let actionManager: ReturnType<typeof registerActionHandlers> = null
  const sessionManager = registerSessionHandlers(() => mainWindow, {
    isActive: () => actionManager?.isExecuting() ?? false,
    dispose: () => actionManager?.dispose() ?? Promise.resolve()
  })
  registerWorkspaceHandlers(() => {
    const status = sessionManager?.getSnapshot().status
    return Boolean(status && ['starting', 'running', 'stopping'].includes(status))
  })
  actionManager = registerActionHandlers(() => sessionManager.getSnapshot())
}
