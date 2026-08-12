import { IPC_CHANNELS } from '../../shared/ipc-types.ts'
import { trustedIpcMain as ipcMain } from './trusted-ipc.ts'
import type { ObservationManager } from '../services/observation/observation-manager.ts'
import type { AutoVerifySettings } from '../../shared/observation-types.ts'

/**
 * Observation IPC surface. All handlers go through the trusted wrapper
 * (renderer-of-origin check). Push events are sent by the ObservationManager
 * via ObservationManagerDeps in ipc/index.ts.
 */
export function registerObservationHandlers(manager: ObservationManager): void {
  ipcMain.handle(IPC_CHANNELS.OBSERVATION_STATUS, () => manager.status())

  ipcMain.handle(IPC_CHANNELS.OBSERVATION_ENABLE, async () => {
    await manager.enable()
    return manager.status()
  })

  ipcMain.handle(IPC_CHANNELS.OBSERVATION_DISABLE, async () => {
    await manager.disable()
    return manager.status()
  })

  ipcMain.handle(IPC_CHANNELS.OBSERVATION_INSTALL_HOOKS_PREVIEW, () => manager.installHooksPreview())

  ipcMain.handle(IPC_CHANNELS.OBSERVATION_CONFIRM_INSTALL_HOOKS, () => manager.confirmInstallHooks())

  ipcMain.handle(IPC_CHANNELS.OBSERVATION_UNINSTALL_HOOKS, () => manager.uninstallHooks())

  ipcMain.handle(IPC_CHANNELS.OBSERVATION_SET_AUTO_VERIFY, (_event, settings: AutoVerifySettings) => {
    manager.setAutoVerify(settings)
    return manager.status()
  })

  ipcMain.handle(IPC_CHANNELS.OBSERVATION_GET_LAST_RECEIPT, () => manager.getLastReceipt())
}
