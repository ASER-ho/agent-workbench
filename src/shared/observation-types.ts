/**
 * Shared types for passive agent observation (transcript polling + HTTP hooks)
 * and recipe-whitelisted auto-verification.
 *
 * SECURITY BOUNDARY: everything in this file crosses to the renderer (IPC).
 * It is therefore strictly display-safe — no full paths, no raw transcript
 * content, no tool input. The main process keeps the full internal event
 * (cwd / transcriptPath / raw) in `ObservedAgentEventInternal` (agent-events.ts)
 * and never sends it over IPC.
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

/**
 * Renderer-safe observed event. No cwd, no transcriptPath, no raw content —
 * only a digest of tool input and a display-safe path label.
 */
export interface ObservedAgentEvent {
  agentKind: AgentKind
  event: ObservedEventName
  sessionId: string
  /** basename or sanitized label of the workspace — never a full path. */
  displayPath: string
  toolName?: string
  /** SHA-256 digest of the tool input — never the raw input itself. */
  toolInputDigest?: string
  timestamp: number
}

export type ObservedSessionStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'attention'
  | 'sleeping'
  | 'error'
  | 'ended'

/** Renderer-safe session summary — no full paths. */
export interface ObservedSession {
  agentKind: AgentKind
  sessionId: string
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
  /** Live auto-verification settings (source of truth for the UI). */
  autoVerify: AutoVerifySettings
  /** Directories that would be watched, display-safe (`~`-relative). */
  watchedDirs: { claudeProjects: string; codexSessions: string }
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

/** How an auto-verification receipt was produced (provenance). */
export type VerificationTrigger = 'manual' | 'auto:session-end'

/** Payload pushed to the renderer when auto-verification completes. */
export interface VerificationCompletedPayload {
  trigger: VerificationTrigger
  receipt: unknown
}
