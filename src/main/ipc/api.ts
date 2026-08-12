import { randomUUID } from 'crypto'
import { app } from 'electron'
import { trustedIpcMain as ipcMain } from './trusted-ipc'
import { readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { IPC_CHANNELS } from '../../shared/ipc-types'
import { FileSecretStore } from '../services/secret-store'
import { ClaudeProcessManager } from '../services/claude-process'
import { getSettingsGlobalPath, getBackupDir, getDisplayPath } from '../utils/paths'
import { isManagedSnapshotName, resolveManagedSnapshotPath } from '../utils/model-snapshot'
import { buildApiEndpoint, isStoredApiBindingAllowed, normalizeApiBaseUrl } from '../utils/api-url'

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(getSettingsGlobalPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  writeFileSync(getSettingsGlobalPath(), JSON.stringify(data, null, 2), 'utf-8')
}

function backupPath(timestamp: string): string {
  return join(getBackupDir(), `settings.json.backup.${timestamp}`)
}

/** Mask shown in place of a stored API key. The real key never crosses IPC. */
function derivePrefix(key: string): string {
  if (!key) return ''
  return '********'
}

export function registerApiHandlers(secretStore: FileSecretStore, processManager: ClaudeProcessManager): void {

  // ─── Test API Connection ───
  ipcMain.handle(IPC_CHANNELS.API_TEST_CONNECTION, async (_event, p: { baseUrl: string; apiKey?: string; apiKeyRef?: string }) => {
    try {
      const normalizedBaseUrl = normalizeApiBaseUrl(p.baseUrl)
      let k = p.apiKey || ''
      if (!k && p.apiKeyRef) {
        const settings = readSettings()
        const saved = (settings['api_test_config'] || {}) as Record<string, unknown>
        if (!isStoredApiBindingAllowed(
          { baseUrl: normalizedBaseUrl, apiKeyRef: p.apiKeyRef },
          { baseUrl: saved['baseUrl'], apiKeyRef: saved['apiKeyRef'] }
        )) {
          return { success: false, message: '密钥引用与已保存的 API 地址不匹配' }
        }
        const stored = await secretStore.getSecret(p.apiKeyRef)
        if (!stored) return { success: false, message: '密钥引用已失效' }
        k = stored
      }
      if (!k) return { success: false, message: '未提供 API Key' }

      const url = buildApiEndpoint(normalizedBaseUrl, '/v1/models')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const resp = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${k}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      })
      clearTimeout(timeout)

      if (resp.ok) {
        return { success: true, message: '连接成功' }
      } else if (resp.status === 401) {
        return { success: false, message: 'API Key 无效，请检查后重试' }
      } else {
        return { success: false, message: `HTTP ${resp.status}: ${resp.statusText}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '连接失败'
      return { success: false, message: msg.includes('abort') ? '连接超时' : msg }
    }
  })

  // ─── Query Balance / Remaining Tokens ───
  ipcMain.handle(IPC_CHANNELS.API_QUERY_BALANCE, async (_event, { baseUrl, apiKey, provider }: { baseUrl: string; apiKey: string; provider: string }) => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      let balanceUrl = ''
      let result: { balance?: number; total?: number; used?: number; currency?: string } = {}

      switch (provider) {
        case 'DeepSeek':
          balanceUrl = 'https://api.deepseek.com/user/balance'
          break
        case 'OpenRouter':
          balanceUrl = 'https://openrouter.ai/api/v1/auth/key'
          break
        default:
          // For OpenAI/Anthropic/Custom — no public balance API
          // Try common pattern: /v1/dashboard/billing/credit_grants
          balanceUrl = buildApiEndpoint(baseUrl, '/v1/dashboard/billing/credit_grants')
      }

      if (balanceUrl) {
        const resp = await fetch(balanceUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        })
        clearTimeout(timeout)

        if (resp.ok) {
          const data = await resp.json()
          if (provider === 'DeepSeek') {
            result = { balance: data.balance_available, currency: data.currency || 'CNY', total: data.total_balance }
          } else if (provider === 'OpenRouter') {
            result = { balance: data.limit_remaining, total: data.limit, used: data.usage }
          } else {
            result = { balance: data.total_granted ? data.total_granted - data.total_used : undefined,
                      total: data.total_granted, used: data.total_used }
          }
          return { success: true, ...result, raw: data }
        } else {
          // If balance API not available, at least test connection
          return { success: true, message: '连接成功（该服务商不支持余额查询）' }
        }
      }
      clearTimeout(timeout)
      return { success: true, message: '连接成功（该服务商不支持余额查询）' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '查询失败'
      return { success: false, message: msg.includes('abort') ? '查询超时' : msg }
    }
  })

  // ─── Save API Config (安全保存：apiKey 经 SecretStore 加密存储，settings 只存 prefix/ref) ───
  ipcMain.handle('api:save-config', async (_event, config: { provider: string; baseUrl: string; apiKey?: string }) => {
    try {
      const normalizedBaseUrl = normalizeApiBaseUrl(config.baseUrl)
      const settings = readSettings()
      const oc = (settings['api_test_config'] || {}) as Record<string, unknown>
      const or = oc['apiKeyRef'] as string | undefined
      let nr = or, np = or ? '********' : ''
      if (config.apiKey) {
        nr = 'api:test:' + randomUUID()
        np = derivePrefix(config.apiKey)
        await secretStore.setSecret(nr, config.apiKey)
      }
      settings['api_test_config'] = { provider: config.provider, baseUrl: normalizedBaseUrl, apiKeyPrefix: np || '', apiKeyRef: nr || '', savedAt: new Date().toISOString() }
      try { writeSettings(settings) } catch {
        if (config.apiKey && nr !== or) await secretStore.deleteSecret(nr).catch(() => {})
        return { success: false, message: '配置保存失败，已回滚密钥' }
      }
      if (nr !== or && or) secretStore.deleteSecret(or).catch(() => console.warn('[api] 旧 ref 清理失败'))
      return { success: true }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '保存失败' }
    }
  })

  // ─── Load API Config (不返回完整 apiKey，返回 prefix/ref/hasKey/hasLegacyKey) ───
  ipcMain.handle('api:load-config', async () => {
    try {
      const settings = readSettings()
      const cfg = (settings['api_test_config'] || {}) as Record<string, unknown>
      const ref = cfg['apiKeyRef'] as string | undefined
      if (ref && cfg['apiKeyPrefix'] !== '********') {
        cfg['apiKeyPrefix'] = '********'
        settings['api_test_config'] = cfg
        try { writeSettings(settings) } catch { console.warn('[api] failed to migrate legacy API key prefix') }
      }
      return {
        provider: (cfg['provider'] as string) || '',
        baseUrl: (cfg['baseUrl'] as string) || '',
        apiKeyPrefix: ref ? '********' : '',
        apiKeyRef: ref || '',
        hasKey: ref ? await secretStore.hasSecret(ref) : false,
        hasLegacyKey: !!(cfg['apiKey'] as string)
      }
    } catch {
      return { provider: '', baseUrl: '', apiKeyPrefix: '', apiKeyRef: '', hasKey: false, hasLegacyKey: false }
    }
  })

  // ═══════════════════════════════════════════════
  // Model / Runtime Safe Mode handlers
  // ═══════════════════════════════════════════════

  // ─── Get Runtime State ───
  ipcMain.handle(IPC_CHANNELS.MODEL_GET_RUNTIME_STATE, async () => {
    try {
      const settings = readSettings()
      const env = (settings.env || {}) as Record<string, string>
      return {
        hasBaseUrl: !!env['ANTHROPIC_BASE_URL'],
        hasAuthToken: !!env['ANTHROPIC_AUTH_TOKEN'],
        hasApiKey: !!env['ANTHROPIC_API_KEY'],
        hasModel: !!env['ANTHROPIC_MODEL'],
        apiProvider: (settings['api_provider'] as string) || '',
        isDefault: !env['ANTHROPIC_BASE_URL'] && !env['ANTHROPIC_AUTH_TOKEN'] && !env['ANTHROPIC_API_KEY'] && !env['ANTHROPIC_MODEL'] && !settings['api_provider']
      }
    } catch {
      return { hasBaseUrl: false, hasAuthToken: false, hasApiKey: false, hasModel: false, apiProvider: '', isDefault: true }
    }
  })

  // ─── Create Snapshot ───
  ipcMain.handle(IPC_CHANNELS.MODEL_CREATE_SNAPSHOT, async () => {
    try {
      if (!existsSync(getSettingsGlobalPath())) {
        return { success: false, message: 'settings.json 不存在，无需备份' }
      }
      const now = new Date()
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
      const dest = backupPath(ts)
      copyFileSync(getSettingsGlobalPath(), dest)
      return { success: true, snapshotName: getDisplayPath(dest).basename, timestamp: ts }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '备份失败' }
    }
  })

  // ─── Reset Safe Mode ───
  ipcMain.handle(IPC_CHANNELS.MODEL_RESET_SAFE_MODE, async () => {
    try {
      const settings = readSettings()
      const env = (settings.env || {}) as Record<string, unknown>
      const removed: string[] = []

      // 1. Backup first
      const now = new Date()
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
      const dest = backupPath(ts)
      if (existsSync(getSettingsGlobalPath())) {
        copyFileSync(getSettingsGlobalPath(), dest)
      }

      // 2. Delete ANTHROPIC_* from env
      if ('ANTHROPIC_BASE_URL' in env) {
        removed.push('ANTHROPIC_BASE_URL')
        delete env['ANTHROPIC_BASE_URL']
      }
      if ('ANTHROPIC_AUTH_TOKEN' in env) {
        removed.push('ANTHROPIC_AUTH_TOKEN')
        delete env['ANTHROPIC_AUTH_TOKEN']
      }
      if ('ANTHROPIC_API_KEY' in env) {
        removed.push('ANTHROPIC_API_KEY')
        delete env['ANTHROPIC_API_KEY']
      }
      if ('ANTHROPIC_MODEL' in env) {
        removed.push('ANTHROPIC_MODEL')
        delete env['ANTHROPIC_MODEL']
      }

      // 3. Remove or disable api_provider
      if (settings['api_provider']) {
        removed.push(`api_provider (${settings['api_provider']})`)
        delete settings['api_provider']
      }

      // 4. Remove root-level model (let Claude Code use its own default)
      if (settings['model']) {
        removed.push(`model (${settings['model']})`)
        delete settings['model']
      }

      // 5. Clean up api_test_config legacy apiKey field (keep prefix/ref)
      const ac = (settings['api_test_config'] || {}) as Record<string, unknown>
      if (ac['apiKey']) {
        delete ac['apiKey']
        settings['api_test_config'] = ac
        removed.push('api_test_config.apiKey (旧明文密钥字段)')
      }

      // 6. Clear runtime provider (in-memory, no settings change)
      processManager.clearRuntimeProvider()
      removed.push('runtimeProvider (临时 Provider 选择)')

      // 7. Write back
      writeSettings(settings)

      return {
        success: true,
        removed,
        backupName: getDisplayPath(dest).basename,
        timestamp: ts,
        hint: '请重启 Claude 终端，并在 Claude CLI 中输入 /model 选择 "Default" 恢复默认模型'
      }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '重置失败' }
    }
  })

  // ─── List Snapshots ───
  ipcMain.handle(IPC_CHANNELS.MODEL_LIST_SNAPSHOTS, async () => {
    try {
      const dir = getBackupDir()
      const files = readdirSync(dir)
      const snapshots = files.flatMap(name => {
        if (!isManagedSnapshotName(name)) return []
        try {
          const managedPath = resolveManagedSnapshotPath(dir, name)
          const stat = statSync(managedPath)
          const timestamp = name.replace('settings.json.backup.', '')
          return [{ name, timestamp, size: stat.size, mtime: stat.mtime.toISOString() }]
        } catch {
          return []
        }
      })
        .sort((a, b) => b.mtime.localeCompare(a.mtime)) // newest first
      return { success: true, snapshots }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '获取快照列表失败' }
    }
  })

  // ─── Rollback ───
  ipcMain.handle(IPC_CHANNELS.MODEL_ROLLBACK, async (_event, payload: { snapshotName?: unknown }) => {
    try {
      const snapshotPath = resolveManagedSnapshotPath(getBackupDir(), payload?.snapshotName)
      const content = readFileSync(snapshotPath, 'utf-8')
      const parsed = JSON.parse(content)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Snapshot settings must be a JSON object')
      }
      // Backup current before rollback
      const now = new Date()
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
      if (existsSync(getSettingsGlobalPath())) {
        copyFileSync(getSettingsGlobalPath(), backupPath(`pre-rollback-${ts}`))
      }
      writeFileSync(getSettingsGlobalPath(), content, 'utf-8')
      return { success: true, restoredFrom: getDisplayPath(snapshotPath).basename }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '回滚失败' }
    }
  })
}
