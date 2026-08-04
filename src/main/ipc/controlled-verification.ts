import { app } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc-types.ts'
import { ControlledVerificationManager } from '../services/controlled-verification-manager.ts'
import { trustedIpcMain as ipcMain } from './trusted-ipc.ts'

/**
 * Registers the controlled verification IPC surface. The manager is the only
 * place that resolves the executable, builds the environment, captures the
 * Subject Snapshot, and records evidence. The renderer may submit only a
 * confirmationId at confirm time.
 */
export function registerControlledVerificationHandlers(): void {
  const e2eGitExecutable = process.env['AGENT_WORKBENCH_E2E_GIT_EXECUTABLE']
  const manager = new ControlledVerificationManager({ gitExecutable: e2eGitExecutable || undefined })

  ipcMain.handle(IPC_CHANNELS.CONTROLLED_VERIFICATION_PREVIEW, async (_event, raw: unknown) => {
    return manager.createPreview(raw)
  })

  ipcMain.handle(IPC_CHANNELS.CONTROLLED_VERIFICATION_CONFIRM, async (_event, raw: unknown) => {
    return manager.confirmAndExecute(raw)
  })

  ipcMain.handle(IPC_CHANNELS.CONTROLLED_VERIFICATION_CANCEL, (_event, raw: unknown) => {
    return manager.cancel(raw)
  })

  const dispose = (): void => { manager.dispose() }
  app.on('before-quit', dispose)
  process.on('exit', dispose)
}
