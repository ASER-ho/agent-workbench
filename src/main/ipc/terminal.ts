import { BrowserWindow } from 'electron'
import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { ClaudeProcessManager } from '../services/claude-process'

export function registerTerminalHandlers(
  getWindow: () => BrowserWindow | null,
  processManager: ClaudeProcessManager
): void {
  // Forward process output to renderer
  processManager.onData((data) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { data })
    }
  })

  processManager.onStatus((status) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      if (status === 'terminated' || status === 'error') {
        win.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { code: status === 'error' ? -1 : 0 })
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_START, () => {
    throw new Error('legacy terminal launch is disabled during local alpha')
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_STOP, async () => {
    processManager.stop()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_WRITE, async (_event, { data }: { data: string }) => {
    processManager.write(data)
  })

  ipcMain.handle(IPC_CHANNELS.TERMINAL_RESIZE, async (_event, { cols, rows }: { cols: number; rows: number }) => {
    processManager.resize(cols, rows)
  })
}
