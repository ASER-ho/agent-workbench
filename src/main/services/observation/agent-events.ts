import { createHash } from 'crypto'
import type { AgentKind, ObservedAgentEvent, ObservedEventName } from '../../../shared/observation-types.ts'

/**
 * Normalization layer for passive agent observation.
 *
 * Two source shapes map onto the internal ObservedAgentEvent model:
 *  - HTTP hook stdin payloads (Claude Code, field names per hook_event_name)
 *  - JSONL transcript lines (Claude Code and Codex session transcripts)
 *
 * Safety rules enforced here:
 *  - tool input is never kept — only a 16-hex SHA-256 digest.
 *  - `raw` never retains tool_input / tool arguments (stripped before storing).
 *  - the event is missing sessionId or cwd -> dropped.
 *  - unknown/malformed transcript lines are skipped, never thrown.
 *
 * `ObservedAgentEventInternal` is MAIN-PROCESS-ONLY: it carries cwd,
 * transcriptPath and raw, and must never be sent over IPC. Use
 * `toPublicEvent()` for anything that crosses to the renderer.
 */

export interface ObservedAgentEventInternal extends ObservedAgentEvent {
  cwd: string
  transcriptPath: string | null
  sourcePid?: number
  /** Raw source line/payload — debug/tests only, never rendered. */
  raw: unknown
}

const CLAUDE_HOOK_EVENT_MAP: Record<string, ObservedEventName> = {
  SessionStart: 'session:start',
  UserPromptSubmit: 'user:prompt',
  PreToolUse: 'tool:start',
  PostToolUse: 'tool:end',
  PostToolUseFailure: 'error',
  Stop: 'assistant:stop',
  StopFailure: 'error',
  SubagentStart: 'subagent:start',
  SubagentStop: 'subagent:end',
  PreCompact: 'compact',
  PostCompact: 'compact',
  Notification: 'notification',
  SessionEnd: 'session:end',
  Elicitation: 'user:prompt'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function digest(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  try {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
  } catch {
    return undefined
  }
}

/** Map a Claude Code HTTP hook stdin payload to an internal event. */
export function normalizeHookEvent(payload: unknown, tokenOk: boolean): ObservedAgentEventInternal | null {
  if (!tokenOk) return null
  const p = asRecord(payload)
  if (!p) return null
  const eventName = str(p['hook_event_name'])
  if (!eventName) return null
  const mapped = CLAUDE_HOOK_EVENT_MAP[eventName]
  if (!mapped) return null
  const sessionId = str(p['session_id'])
  const cwd = str(p['cwd'])
  if (!sessionId || !cwd) return null
  const toolName = str(p['tool_name']) ?? undefined
  const toolInputDigest = toolName ? digest(p['tool_input']) : undefined
  const sourcePid = typeof p['source_pid'] === 'number' ? p['source_pid'] : undefined
  // Never retain the raw tool input; store the rest for debug only.
  const safeRaw: Record<string, unknown> = { ...p }
  delete safeRaw['tool_input']
  return {
    agentKind: 'claude-code',
    event: mapped,
    sessionId,
    cwd,
    displayPath: displayPath(cwd),
    transcriptPath: str(p['transcript_path']),
    toolName,
    toolInputDigest,
    sourcePid,
    timestamp: typeof p['timestamp'] === 'number' ? p['timestamp'] : Date.now(),
    raw: safeRaw
  }
}

function parseClaudeTranscriptLine(line: Record<string, unknown>): ObservedAgentEventInternal | null {
  const type = str(line['type'])
  if (!type) return null
  const sessionId = str(line['sessionId']) ?? str(line['session_id'])
  const cwd = str(line['cwd'])
  if (!sessionId || !cwd) return null
  const timestamp = typeof line['timestamp'] === 'number' ? line['timestamp'] : Date.now()
  const transcriptPath = str(line['transcriptPath']) ?? null
  // Claude transcript lines may carry tool results (toolUseResult.stdout) or
  // assistant message content. Keep only structural fields for `raw`.
  const safeRaw: Record<string, unknown> = { type, sessionId, cwd }
  switch (type) {
    case 'user':
      return { agentKind: 'claude-code', event: 'user:prompt', sessionId, cwd, displayPath: displayPath(cwd), transcriptPath, timestamp, raw: safeRaw }
    case 'assistant':
      return { agentKind: 'claude-code', event: 'assistant:stop', sessionId, cwd, displayPath: displayPath(cwd), transcriptPath, timestamp, raw: safeRaw }
    case 'system':
      return { agentKind: 'claude-code', event: 'notification', sessionId, cwd, displayPath: displayPath(cwd), transcriptPath, timestamp, raw: safeRaw }
    case 'attachment':
      return { agentKind: 'claude-code', event: 'notification', sessionId, cwd, displayPath: displayPath(cwd), transcriptPath, timestamp, raw: safeRaw }
    default:
      return null
  }
}

function parseCodexTranscriptLine(line: Record<string, unknown>): ObservedAgentEventInternal | null {
  const type = str(line['type'])
  if (!type) return null
  const timestamp = typeof line['timestamp'] === 'number' ? line['timestamp'] : Date.now()
  const payload = asRecord(line['payload'])

  if (type === 'session_meta') {
    const sessionId = str(line['id']) ?? str(payload?.['id'])
    const cwd = str(payload?.['cwd'])
    if (!sessionId || !cwd) return null
    return { agentKind: 'codex', event: 'session:start', sessionId, cwd, displayPath: displayPath(cwd), transcriptPath: null, timestamp, raw: { type } }
  }

  const sessionId = str(line['sessionId']) ?? str(payload?.['sessionId'])
  const cwd = str(payload?.['cwd'])
  if (!sessionId || !cwd) return null

  if (type === 'response_item') {
    const itemType = str(payload?.['type'])
    if (itemType === 'function_call' || itemType === 'custom_tool_call') {
      // Never retain tool arguments; keep only the call kind.
      const safePayload: Record<string, unknown> = { type: itemType }
      return { agentKind: 'codex', event: 'tool:start', sessionId, cwd, displayPath: displayPath(cwd), transcriptPath: null, timestamp, raw: { type, payload: safePayload } }
    }
    return null
  }

  if (type === 'event_msg') {
    const msgType = str(payload?.['type'])
    const map: Record<string, ObservedEventName> = {
      task_started: 'user:prompt',
      user_message: 'user:prompt',
      exec_command_end: 'tool:end',
      patch_apply_end: 'tool:end',
      task_complete: 'assistant:stop',
      context_compacted: 'compact',
      turn_aborted: 'error'
    }
    const mapped = msgType ? map[msgType] : undefined
    if (!mapped) return null
    // Event messages may embed command output details; keep only the kind.
    const safePayload: Record<string, unknown> = { type: msgType }
    return { agentKind: 'codex', event: mapped, sessionId, cwd, displayPath: displayPath(cwd), transcriptPath: null, timestamp, raw: { type, payload: safePayload } }
  }

  return null
}

/** Parse a single JSONL transcript line; tolerant of unknown shapes. */
export function normalizeTranscriptLine(line: string, agentKind: AgentKind): ObservedAgentEventInternal | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const rec = asRecord(parsed)
  if (!rec) return null
  return agentKind === 'codex' ? parseCodexTranscriptLine(rec) : parseClaudeTranscriptLine(rec)
}

/**
 * Renderer-safe projection: drops cwd, transcriptPath, sourcePid and raw.
 * This is the only form that may cross the IPC boundary.
 */
export function toPublicEvent(event: ObservedAgentEventInternal): ObservedAgentEvent {
  const { cwd: _cwd, transcriptPath: _tp, sourcePid: _sp, raw: _raw, ...pub } = event
  return pub
}

/** Basename of a path-like string; used for display-safe session labels. */
export function displayPath(cwd: string): string {
  const cleaned = cwd.replace(/[\\/]+$/, '')
  const idx = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'))
  const base = idx >= 0 ? cleaned.slice(idx + 1) : cleaned
  return base || 'workspace'
}
