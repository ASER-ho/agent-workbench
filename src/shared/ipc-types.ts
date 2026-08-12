// ──────────────────────────────────────────
// Shared IPC types for Agent Workbench
// ──────────────────────────────────────────

// === File System ===
export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: string
}

export interface FileContent {
  content: string
  mtime: string
}

export interface FrontmatterDoc {
  frontmatter: Record<string, unknown>
  body: string
  raw: string
}

export interface WriteFileOptions {
  path: string
  content: string
}

export interface WriteFrontmatterOptions {
  path: string
  frontmatter: Record<string, unknown>
  body: string
}

// === Workspace ===
export interface WorkspaceInfo {
  root: string
  memoryDir: string
  skillsDir: string
  projectsDir: string
  settingsLocalPath: string
  claudeMdPath: string
}

export interface FileTree {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTree[]
  meta?: {
    fileType?: 'memory' | 'skill' | 'transcript' | 'settings' | 'claude-md'
    skillName?: string
    transcriptCount?: number
  }
}

// === Transcript ===
export interface TranscriptMeta {
  sessionId: string
  filePath: string
  fileSize: number
  lastModified: string
  messageCount?: number
  firstPrompt?: string
  lastPrompt?: string
  errorCount?: number
  dateRange?: {
    start: string
    end: string
  }
}

export interface TranscriptEvent {
  type: 'user' | 'assistant' | 'system' | 'attachment' | 'mode' | 'last-prompt'
  timestamp: string
  content?: string
  role?: string
  error?: string
  uuid?: string
  parentUuid?: string | null
  raw: Record<string, unknown>
}

export interface SearchResult {
  sessionId: string
  filePath: string
  matches: Array<{
    line: number
    text: string
    context: string
  }>
  score: number
}

// === Settings ===
export interface ClaudeSettings {
  permissions?: {
    allow?: string[]
    deny?: string[]
  }
  env?: Record<string, string>
  hooks?: Record<string, unknown>
  [key: string]: unknown
}

// === Terminal ===
export type TerminalStatus = 'stopped' | 'starting' | 'running' | 'error' | 'terminated'

// === Diagnostics ===
export type DiagnosticStatus = 'ok' | 'warn' | 'error' | 'info'
export interface DiagnosticItem {
  id: string
  title: string
  status: DiagnosticStatus
  summary: string
  displaySummary?: string
  detail?: string
  fix?: string
  sensitive?: boolean
}
export interface DiagnosticReport {
  timestamp: number
  items: DiagnosticItem[]
  summary: {
    ok: number
    warn: number
    error: number
    info: number
  }
}

// === Package Progress ===
export type PackageProgressStage =
  | 'prepare'
  | 'copy-out'
  | 'copy-deps'
  | 'scan'
  | 'compress'
  | 'cleanup'
  | 'done'
  | 'failed'

export interface PackageProgress {
  stage: PackageProgressStage
  label: string
  elapsedMs: number
  etaLabel: string
  percent?: number
}

// === Runtime Provider ===
export interface RuntimeProviderStatus {
  mode: 'default' | 'custom'
  name?: string
  providerType?: string
  sanitizedHost?: string
  hasModel?: boolean
}

export interface SetRuntimeProviderRequest {
  apiKeyRef: string
  baseUrl: string
  name?: string
  providerType?: string
  model?: string
}

// === Tab ===
export type FileType = 'memory' | 'skill' | 'transcript' | 'settings' | 'claude-md' | 'welcome'

export interface Tab {
  id: string
  label: string
  filePath: string
  fileType: FileType
  icon?: string
  dirty: boolean
  savedContent?: string
}

// === IPC Channels ===
export const IPC_CHANNELS = {
  // File system
  FS_READ_FILE: 'fs:read-file',
  FS_WRITE_FILE: 'fs:write-file',
  FS_READ_FRONTMATTER: 'fs:read-frontmatter',
  FS_WRITE_FRONTMATTER: 'fs:write-frontmatter',
  FS_LIST_DIRECTORY: 'fs:list-directory',
  FS_CREATE_FILE: 'fs:create-file',
  FS_CREATE_DIRECTORY: 'fs:create-directory',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',

  // Terminal
  TERMINAL_START: 'terminal:start',
  TERMINAL_STOP: 'terminal:stop',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',

  // Isolated stub Agent Session
  SESSION_READINESS: 'session:readiness',
  SESSION_PREPARE: 'session:prepare',
  SESSION_START: 'session:start',
  SESSION_INPUT: 'session:input',
  SESSION_STOP: 'session:stop',
  SESSION_GET_STATUS: 'session:get-status',

  // Fixture-only controlled actions
  ACTION_PROPOSE: 'action:propose',
  ACTION_APPROVE: 'action:approve',
  ACTION_REJECT: 'action:reject',
  ACTION_CANCEL: 'action:cancel',
  ACTION_EXECUTE: 'action:execute',
  ACTION_GET_RECEIPTS: 'action:get-receipts',

  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECTS_SEARCH: 'projects:search',
  PROJECTS_READ_TRANSCRIPT: 'projects:read-transcript',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',

  // Workspace
  WORKSPACE_GET_INFO: 'workspace:get-info',
  WORKSPACE_REFRESH_TREE: 'workspace:refresh-tree',

  // Settings / Maintenance
  INTEGRITY_CHECK: 'integrity:check',
  INTEGRITY_REPAIR: 'integrity:repair',
  CLAUDE_DETECT: 'claude:detect',
  API_TEST_CONNECTION: 'api:test-connection',
  API_QUERY_BALANCE: 'api:query-balance',
  PACKAGE_SHARE: 'package:share',

  // Package progress (main → renderer)
  PACKAGE_PROGRESS: 'package:progress',

  // Model / Runtime safe mode
  MODEL_GET_RUNTIME_STATE: 'model:get-runtime-state',
  MODEL_CREATE_SNAPSHOT: 'model:create-snapshot',
  MODEL_RESET_SAFE_MODE: 'model:reset-safe-mode',
  MODEL_LIST_SNAPSHOTS: 'model:list-snapshots',
  MODEL_ROLLBACK: 'model:rollback',

  // Push events (main → renderer)
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_ERROR: 'terminal:error',
  SESSION_DATA: 'session:data',
  SESSION_STATUS_EVENT: 'session:status',
  FILE_CHANGED: 'file:changed',

  // Diagnostics
  DIAGNOSTICS_RUN: 'diagnostics:run',
  DIAGNOSTICS_LAST_REPORT: 'diagnostics:get-last-report',

  // Runtime Provider
  RUNTIME_SET_PROVIDER: 'runtime:set-provider',
  RUNTIME_CLEAR_PROVIDER: 'runtime:clear-provider',
  RUNTIME_GET_STATUS: 'runtime:get-status',

  // Project Capsule (Phase 1A MVP)
  CAPSULE_LOAD: 'capsule:load',
  CAPSULE_SAVE: 'capsule:save',
  CAPSULE_PICK_WORKSPACE: 'capsule:pickWorkspaceLabel',

  // Workspace selection (Workspace Foundation)
  WORKSPACE_STATUS: 'workspace:status',
  WORKSPACE_CHOOSE: 'workspace:choose',
  WORKSPACE_CLEAR: 'workspace:clear',
  WORKSPACE_CHANGED: 'workspace:changed',
  VERIFICATION_INSPECT: 'verification:inspect',

  // Controlled verification (R2B2B + R2C): immutable preview, one-time confirm
  CONTROLLED_VERIFICATION_PREVIEW: 'controlled-verification:preview',
  CONTROLLED_VERIFICATION_CONFIRM: 'controlled-verification:confirm',
  CONTROLLED_VERIFICATION_CANCEL: 'controlled-verification:cancel',
  CONTROLLED_VERIFICATION_EXPORT: 'controlled-verification:export',

  // Passive observation + auto-verification
  OBSERVATION_STATUS: 'observation:status',
  OBSERVATION_ENABLE: 'observation:enable',
  OBSERVATION_DISABLE: 'observation:disable',
  OBSERVATION_INSTALL_HOOKS_PREVIEW: 'observation:install-hooks-preview',
  OBSERVATION_CONFIRM_INSTALL_HOOKS: 'observation:confirm-install-hooks',
  OBSERVATION_UNINSTALL_HOOKS: 'observation:uninstall-hooks',
  OBSERVATION_SET_AUTO_VERIFY: 'observation:set-auto-verify',
  OBSERVATION_GET_LAST_RECEIPT: 'observation:get-last-receipt',
  OBSERVATION_EVENT: 'observation:event',
  OBSERVATION_SESSION_UPDATED: 'observation:session-updated',
  OBSERVATION_VERIFICATION_COMPLETED: 'observation:verification-completed'
} as const
