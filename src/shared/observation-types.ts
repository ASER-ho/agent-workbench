/**
 * Shared types for passive agent observation (transcript polling + HTTP hooks)
 * and recipe-whitelisted auto-verification. All paths leaving the main process
 * are display-safe (basename or sanitized label) — never a full path.
 */

export type AgentKind = 'claude-code' | 'codex'

/**
 * Normalized internal event name. Source-specific names (hook events, JSONL
 * line types) map onto these via agent-events.ts.
 */
export type ObservedEventName =
  | 'session:start'
  | 'user:prompt'
  | 'tool:start'
  | 'tool:end'
  | 'assistant:stop'
  | 'subagent:start'
  | 'subagent:end'
  | 'compact'
  | 'error'
  | 'notification'
  | 'session:end'

export interface ObservedAgentEvent {
  agentKind: AgentKind
  event: ObservedEventName
  sessionId: string
  cwd: string
  transcriptPath: string | null
  toolName?: string
  /** SHA-256 digest of the tool input — never the raw input itself. */
  toolInputDigest?: string
  sourcePid?: number
  timestamp: number
  /** Raw source event (tests/debug only; never rendered). */
  raw: unknown
}

export type ObservedSessionStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'attention'
  | 'sleeping'
  | 'error'
  | 'ended'

export interface ObservedSession {
  agentKind: AgentKind
  sessionId: string
  cwd: string
  /** basename or sanitized label — never a full path. */
  displayPath: string
  status: ObservedSessionStatus
  startedAt: number
  lastEventAt: number
  eventCount: number
}

export interface ObservationStatus {
  enabled: boolean
  hooksInstalled: boolean
  /** basename only of the settings file, or null. */
  hookConfigPath: string | null
  activeSessions: ObservedSession[]
  lastError: string | null
}

export interface AutoVerifySettings {
  autoVerifyEnabled: boolean
  /** Only verify when the observed session cwd matches the selected workspace. */
  workspaceOnly: boolean
  /** Subset of REGISTERED_RECIPES ids allowed to auto-run. */
  recipeIds: string[]
}

export interface HookPreviewResult {
  ok: boolean
  backupPath: string | null
  reason?: string
  /** Full JSON that would be written to settings.json (for the confirm dialog). */
  previewJson?: string
  /** basename of the settings file that would be modified. */
  targetPath?: string
}
