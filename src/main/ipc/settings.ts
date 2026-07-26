import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { getSettingsLocalPath, getSettingsGlobalPath } from '../utils/paths'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_READ, async (_event, { scope }: { scope: 'local' | 'global' }) => {
    const path = scope === 'local' ? getSettingsLocalPath() : getSettingsGlobalPath()
    if (!existsSync(path)) return {}
    const content = readFileSync(path, 'utf-8')
    try {
      return JSON.parse(content)
    } catch {
      return { _error: 'Failed to parse settings JSON' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_WRITE, async (_event, { scope, data }: { scope: 'local' | 'global'; data: Record<string, unknown> }) => {
    const path = scope === 'local' ? getSettingsLocalPath() : getSettingsGlobalPath()
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  })
}
