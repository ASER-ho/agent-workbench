import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-types'
import type { DiagnosticReport, RuntimeProviderStatus, SetRuntimeProviderRequest, PackageProgress } from '../shared/ipc-types'
import type { ProjectCapsule } from '../shared/capsule-types'
import type { SessionLaunchPlan, SessionReadiness, SessionSnapshot } from '../shared/session-types'
import type {
  ActionApproval, ActionBinding, ActionExecutionResult, ActionProposal, ActionType, WorkReceipt
} from '../shared/action-types'

interface CapsuleLoadResult {
  capsule: ProjectCapsule
  source: 'saved' | 'default' | 'fallback'
  loadError?: string
}

interface CapsuleSaveResult {
  success: boolean
  error?: string
  warning?: string
}

interface CapsulePickResult {
  cancelled: boolean
  projectName?: string
  workspaceLabel?: string
  safePathLabel?: string
}

// Type for the exposed API
export interface AgentWorkbenchApi {
  fs: {
    readFile: (path: string) => Promise<{ content: string; mtime: string }>
    writeFile: (path: string, content: string) => Promise<void>
    readFrontmatter: (path: string) => Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }>
    writeFrontmatter: (path: string, frontmatter: Record<string, unknown>, body: string) => Promise<void>
    listDirectory: (path: string) => Promise<Array<{
      name: string; path: string; isDirectory: boolean; size: number; mtime: string
    }>>
    createFile: (parentDir: string, name: string) => Promise<string>
    createDirectory: (parentDir: string, name: string) => Promise<string>
    delete: (path: string) => Promise<void>
    rename: (oldPath: string, newName: string) => Promise<string>
  }
  terminal: {
    onData: (callback: (data: string) => void) => () => void
    onExit: (callback: (code: number) => void) => () => void
    onError: (callback: (msg: string) => void) => () => void
  }
  projects: {
    list: () => Promise<Array<{
      sessionId: string; filePath: string; fileSize: number; lastModified: string
    }>>
    search: (query: string) => Promise<Array<unknown>>
    readTranscript: (filePath: string) => Promise<Array<{
      type: string; timestamp: string; content: string; role?: string; error?: string
      uuid?: string; parentUuid?: string | null; raw: Record<string, unknown>
    }>>
  }
  settings: {
    read: (scope: 'local' | 'global') => Promise<Record<string, unknown>>
    write: (scope: 'local' | 'global', data: Record<string, unknown>) => Promise<void>
  }
  workspace: {
    getInfo: () => Promise<{
      root: string; memoryDir: string; skillsDir: string; projectsDir: string
      settingsLocalPath: string; claudeMdPath: string
    }>
    refreshTree: () => Promise<{
      root: string; sections: Array<{ name: string; path: string; items: Array<unknown> }>
    }>
  }
  maintenance: {
    integrityCheck: () => Promise<{
      results: Array<{ file: string; status: 'ok' | 'missing' | 'empty'; size: number }>
      summary: { total: number; ok: number; missing: number; empty: number }
    }>
    integrityRepair: () => Promise<{ repaired: string[]; errors: string[]; count: number }>
    detectClaude: () => Promise<{
      paths: Array<{ path: string; exists: boolean }>
      foundPath: string | null
      version: string | null
      found: boolean
    }>
  }
  api: {
    testConnection: (baseUrl: string, apiKey?: string, apiKeyRef?: string) => Promise<{ success: boolean; message: string }>
    queryBalance: (baseUrl: string, apiKey: string, provider: string) => Promise<Record<string, unknown>>
    saveConfig: (config: { provider: string; baseUrl: string; apiKey?: string }) => Promise<{ success: boolean; message?: string }>
    loadConfig: () => Promise<{ provider: string; baseUrl: string; apiKeyPrefix: string; apiKeyRef: string; hasKey: boolean; hasLegacyKey: boolean }>
  }
  runtime: {
    setProvider: (req: SetRuntimeProviderRequest) => Promise<{ success: boolean; message?: string; status?: RuntimeProviderStatus }>
    clearProvider: () => Promise<{ success: boolean; message?: string; status?: RuntimeProviderStatus }>
    getStatus: () => Promise<RuntimeProviderStatus>
  }
  model: {
    getRuntimeState: () => Promise<{
      hasBaseUrl: boolean; hasAuthToken: boolean; hasApiKey: boolean; hasModel: boolean
      apiProvider: string; isDefault: boolean
    }>
    createSnapshot: () => Promise<{ success: boolean; snapshotName?: string; timestamp?: string; message?: string }>
    resetSafeMode: () => Promise<{
      success: boolean; removed?: string[]; backupName?: string; timestamp?: string
      hint?: string; message?: string
    }>
    listSnapshots: () => Promise<{
      success: boolean; snapshots?: Array<{
        name: string; timestamp: string; size: number; mtime: string
      }>; message?: string
    }>
    rollback: (snapshotName: string) => Promise<{ success: boolean; restoredFrom?: string; message?: string }>
  }
  package: {
    createShareZip: () => Promise<{
      success: boolean
      path?: string
      sizeMB?: string
      error?: string
      securityScan?: { passed: boolean; message: string; suspiciousFiles: string[] }
    }>
    onProgress: (callback: (progress: PackageProgress) => void) => () => void
  }
  diagnostics: {
    run: () => Promise<DiagnosticReport>
    getLastReport: () => Promise<DiagnosticReport | null>
  }
  session: {
    readiness: (workspaceLabel: string, confirmationId?: string) => Promise<SessionReadiness>
    prepareLaunch: (workspaceLabel: string) => Promise<SessionLaunchPlan>
    start: (confirmationId: string) => Promise<SessionSnapshot>
    input: (text: string) => Promise<{ success: true }>
    stop: () => Promise<SessionSnapshot>
    getStatus: () => Promise<SessionSnapshot>
    onData: (callback: (data: string) => void) => () => void
    onStatus: (callback: (snapshot: SessionSnapshot) => void) => () => void
  }
  action: {
    propose: (input: { actionType: ActionType; workspaceLabel: string }) => Promise<ActionProposal>
    approve: (binding: ActionBinding) => Promise<ActionApproval>
    reject: (binding: ActionBinding) => Promise<WorkReceipt>
    cancel: (binding: ActionBinding) => Promise<WorkReceipt>
    execute: (approvalId: string) => Promise<ActionExecutionResult>
    getReceipts: () => Promise<WorkReceipt[]>
  }
  capsule: {
    load: () => Promise<CapsuleLoadResult>
    save: (capsule: ProjectCapsule) => Promise<CapsuleSaveResult>
    pickWorkspaceLabel: () => Promise<CapsulePickResult>
  }
}

const api: AgentWorkbenchApi = {
  fs: {
    readFile: (path) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, path),
    writeFile: (path, content) => ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, { path, content }),
    readFrontmatter: (path) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FRONTMATTER, path),
    writeFrontmatter: (path, frontmatter, body) =>
      ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FRONTMATTER, { path, frontmatter, body }),
    listDirectory: (path) => ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_DIRECTORY, path),
    createFile: (parentDir, name) => ipcRenderer.invoke(IPC_CHANNELS.FS_CREATE_FILE, { parentDir, name }),
    createDirectory: (parentDir, name) => ipcRenderer.invoke(IPC_CHANNELS.FS_CREATE_DIRECTORY, { parentDir, name }),
    delete: (path) => ipcRenderer.invoke(IPC_CHANNELS.FS_DELETE, { path }),
    rename: (oldPath, newName) => ipcRenderer.invoke(IPC_CHANNELS.FS_RENAME, { oldPath, newName })
  },

  terminal: {
    onData: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, d: { data: string }) => callback(d.data)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_DATA, handler)
    },
    onExit: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, d: { code: number }) => callback(d.code)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, handler)
    },
    onError: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, d: { message: string }) => callback(d.message)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_ERROR, handler)
    }
  },

  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SEARCH, { query }),
    readTranscript: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_READ_TRANSCRIPT, { filePath })
  },

  settings: {
    read: (scope) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_READ, { scope }),
    write: (scope, data) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_WRITE, { scope, data })
  },

  workspace: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_INFO),
    refreshTree: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REFRESH_TREE)
  },
  maintenance: {
    integrityCheck: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRITY_CHECK),
    integrityRepair: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRITY_REPAIR),
    detectClaude: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_DETECT)
  },
  api: {
    testConnection: (baseUrl, apiKey, apiKeyRef) => ipcRenderer.invoke(IPC_CHANNELS.API_TEST_CONNECTION, { baseUrl, apiKey, apiKeyRef }),
    queryBalance: (baseUrl, apiKey, provider) => ipcRenderer.invoke(IPC_CHANNELS.API_QUERY_BALANCE, { baseUrl, apiKey, provider }),
    saveConfig: (config) => ipcRenderer.invoke('api:save-config', config),
    loadConfig: () => ipcRenderer.invoke('api:load-config')
  },
  runtime: {
    setProvider: (req) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_SET_PROVIDER, req),
    clearProvider: () => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_CLEAR_PROVIDER),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_GET_STATUS)
  },
  model: {
    getRuntimeState: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_GET_RUNTIME_STATE),
    createSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_CREATE_SNAPSHOT),
    resetSafeMode: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_RESET_SAFE_MODE),
    listSnapshots: () => ipcRenderer.invoke(IPC_CHANNELS.MODEL_LIST_SNAPSHOTS),
    rollback: (snapshotName) => ipcRenderer.invoke(IPC_CHANNELS.MODEL_ROLLBACK, { snapshotName })
  },
  package: {
    createShareZip: () => ipcRenderer.invoke(IPC_CHANNELS.PACKAGE_SHARE),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: PackageProgress) => callback(progress)
      ipcRenderer.on(IPC_CHANNELS.PACKAGE_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PACKAGE_PROGRESS, handler)
    }
  },
  diagnostics: {
    run: () => ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_RUN),
    getLastReport: () => ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_LAST_REPORT)
  },
  session: {
    readiness: (workspaceLabel, confirmationId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_READINESS, { workspaceLabel, confirmationId }),
    prepareLaunch: (workspaceLabel) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_PREPARE, { workspaceLabel }),
    start: (confirmationId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_START, { confirmationId }),
    input: (text) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_INPUT, { text }),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_STATUS),
    onData: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { data: string }) => callback(payload.data)
      ipcRenderer.on(IPC_CHANNELS.SESSION_DATA, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_DATA, handler)
    },
    onStatus: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, snapshot: SessionSnapshot) => callback(snapshot)
      ipcRenderer.on(IPC_CHANNELS.SESSION_STATUS_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STATUS_EVENT, handler)
    }
  },
  action: {
    propose: (input) => ipcRenderer.invoke(IPC_CHANNELS.ACTION_PROPOSE, input),
    approve: (binding) => ipcRenderer.invoke(IPC_CHANNELS.ACTION_APPROVE, binding),
    reject: (binding) => ipcRenderer.invoke(IPC_CHANNELS.ACTION_REJECT, binding),
    cancel: (binding) => ipcRenderer.invoke(IPC_CHANNELS.ACTION_CANCEL, binding),
    execute: (approvalId) => ipcRenderer.invoke(IPC_CHANNELS.ACTION_EXECUTE, { approvalId }),
    getReceipts: () => ipcRenderer.invoke(IPC_CHANNELS.ACTION_GET_RECEIPTS)
  },
  capsule: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.CAPSULE_LOAD),
    save: (capsule) => ipcRenderer.invoke(IPC_CHANNELS.CAPSULE_SAVE, capsule),
    pickWorkspaceLabel: () => ipcRenderer.invoke(IPC_CHANNELS.CAPSULE_PICK_WORKSPACE)
  }
}

contextBridge.exposeInMainWorld('api', api)
