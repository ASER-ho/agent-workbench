import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { readFileSync } from 'node:fs'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import type { SetRuntimeProviderRequest } from '../../shared/ipc-types'
import { ClaudeProcessManager } from '../services/claude-process'
import { getSettingsGlobalPath } from '../utils/paths'
import { isStoredApiBindingAllowed, normalizeApiBaseUrl } from '../utils/api-url'

function readSavedApiBinding(): { baseUrl: unknown; apiKeyRef: unknown } {
  try {
    const settings = JSON.parse(readFileSync(getSettingsGlobalPath(), 'utf8')) as Record<string, unknown>
    const config = (settings['api_test_config'] || {}) as Record<string, unknown>
    return { baseUrl: config['baseUrl'], apiKeyRef: config['apiKeyRef'] }
  } catch {
    return { baseUrl: undefined, apiKeyRef: undefined }
  }
}

export function registerRuntimeHandlers(
  processManager: ClaudeProcessManager,
  deps: { hasSecret: (ref: string) => Promise<boolean> }
): void {
  ipcMain.handle(IPC_CHANNELS.RUNTIME_SET_PROVIDER, async (_event, req: SetRuntimeProviderRequest) => {
    try {
      if (!req.apiKeyRef) return { success: false, message: '密钥引用不能为空' }
      const normalizedBaseUrl = normalizeApiBaseUrl(req.baseUrl)
      if (!isStoredApiBindingAllowed(
        { baseUrl: normalizedBaseUrl, apiKeyRef: req.apiKeyRef },
        readSavedApiBinding()
      )) {
        return { success: false, message: '密钥引用与已保存的 API 地址不匹配' }
      }
      const exists = await deps.hasSecret(req.apiKeyRef)
      if (!exists) return { success: false, message: '密钥引用无效' }

      processManager.setRuntimeProvider({
        mode: 'custom', name: req.name || '自定义 Provider', providerType: req.providerType,
        baseUrl: normalizedBaseUrl, apiKeyRef: req.apiKeyRef, model: req.model
      })
      return { success: true, status: processManager.getRuntimeProviderStatus() }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '设置失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RUNTIME_CLEAR_PROVIDER, async () => {
    try {
      processManager.clearRuntimeProvider()
      return { success: true, status: processManager.getRuntimeProviderStatus() }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '清除失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RUNTIME_GET_STATUS, async () => {
    return processManager.getRuntimeProviderStatus()
  })
}
