import { dialog, BrowserWindow } from 'electron'
import { trustedIpcMain as ipcMain } from '../../ipc/trusted-ipc.ts'
import { IPC_CHANNELS } from '../../../shared/ipc-types.ts'
import {
  getWorkspaceSelectionStatus,
  setWorkspacePath,
  clearWorkspace,
  type WorkspaceSelectionStatus
} from './workspace-selection.ts'

export type { WorkspaceSelectionStatus }

export function registerWorkspaceHandlers(isSessionActive?: () => boolean): void {
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_STATUS, () => {
    return getWorkspaceSelectionStatus()
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_CHOOSE, async (event) => {
    if (isSessionActive?.()) {
      return { cancelled: false as const, rejected: true as const, blockedBySession: true as const, status: getWorkspaceSelectionStatus() }
    }
    const ownerWindow = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Select Workspace Directory',
      properties: ['openDirectory', 'dontAddToRecent'] as Array<'openDirectory' | 'dontAddToRecent'>
    }
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true as const, status: getWorkspaceSelectionStatus() }
    }

    const selected = result.filePaths[0]
    const canonical = setWorkspacePath(selected)
    if (!canonical) {
      return { cancelled: false as const, rejected: true as const, status: getWorkspaceSelectionStatus() }
    }
    ownerWindow.webContents.send(IPC_CHANNELS.WORKSPACE_CHANGED, getWorkspaceSelectionStatus())
    return { cancelled: false as const, rejected: false as const, status: getWorkspaceSelectionStatus() }
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_CLEAR, (event) => {
    if (isSessionActive?.()) {
      return { rejected: true as const, blockedBySession: true as const, status: getWorkspaceSelectionStatus() }
    }
    clearWorkspace()
    const status = getWorkspaceSelectionStatus()
    const ownerWindow = BrowserWindow.fromWebContents(event.sender)
    if (ownerWindow && !ownerWindow.isDestroyed()) ownerWindow.webContents.send(IPC_CHANNELS.WORKSPACE_CHANGED, status)
    return status
  })
}
