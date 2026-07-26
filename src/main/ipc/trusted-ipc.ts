import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMain } from 'electron'
import { isTrustedIpcSender } from './ipc-sender-policy'

let trustedWindow: BrowserWindow | null = null

export function setTrustedIpcWindow(window: BrowserWindow): void {
  trustedWindow = window
}

export const trustedIpcMain: Pick<IpcMain, 'handle'> = {
  handle(channel, listener): void {
    ipcMain.handle(channel, (event, ...args) => {
      const window = trustedWindow
      if (!window || !isTrustedIpcSender(event, window)) {
        throw new Error('Untrusted IPC sender')
      }
      return listener(event, ...args)
    })
  }
}
