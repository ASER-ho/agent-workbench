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
 *  - an event missing sessionId or cwd is dropped.
 *  - unknown/malformed transcript lines are skipped, never thrown.
 */

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
export function normalizeHookEvent(payload: unknown, tokenOk: boolean): ObservedAgentEvent | null {
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
  const safeRaw: Record<string, unknown> = { ...p }
  delete safeRaw['tool_input']
  return {
    agentKind: 'claude-code',
    event: mapped,
    sessionId,
    cwd,
    transcriptPath: str(p['transcript_path']),
    toolName,
    toolInputDigest,
    sourcePid,
    timestamp: typeof p['timestamp'] === 'number' ? p['timestamp'] : Date.now(),
    raw: safeRaw
  }
}

function parseClaudeTranscriptLine(line: Record<string, unknown>): ObservedAgentEvent | null {
  const type = str(line['type'])
  if (!type) return null
  const sessionId = str(line['sessionId']) ?? str(line['session_id'])
  const cwd = str(line['cwd'])
  if (!sessionId || !cwd) return null
  const timestamp = typeof line['timestamp'] === 'number' ? line['timestamp'] : Date.now()
  const transcriptPath = str(line['transcriptPath']) ?? null
  switch (type) {
    case 'user':
      return { agentKind: 'claude-code', event: 'user:prompt', sessionId, cwd, transcriptPath, timestamp, raw: line }
    case 'assistant':
      return { agentKind: 'claude-code', event: 'assistant:stop', sessionId, cwd, transcriptPath, timestamp, raw: line }
    case 'system':
      return { agentKind: 'claude-code', event: 'notification', sessionId, cwd, transcriptPath, timestamp, raw: line }
    case 'attachment':
      return { agentKind: 'claude-code', event: 'notification', sessionId, cwd, transcriptPath, timestamp, raw: line }
    default:
      return null
  }
}

function parseCodexTranscriptLine(line: Record<string, unknown>): ObservedAgentEvent | null {
  const type = str(line['type'])
  if (!type) return null
  const timestamp = typeof line['timestamp'] === 'number' ? line['timestamp'] : Date.now()
  const payload = asRecord(line['payload'])

  if (type === 'session_meta') {
    const sessionId = str(line['id']) ?? str(payload?.['id'])
    const cwd = str(payload?.['cwd'])
    if (!sessionId || !cwd) return null
    return { agentKind: 'codex', event: 'session:start', sessionId, cwd, transcriptPath: null, timestamp, raw: line }
  }

  const sessionId = str(line['sessionId']) ?? str(payload?.['sessionId'])
  const cwd = str(payload?.['cwd'])
  if (!sessionId || !cwd) return null

  if (type === 'response_item') {
    const itemType = str(payload?.['type'])
    if (itemType === 'function_call' || itemType === 'custom_tool_call') {
      const safePayload: Record<string, unknown> = { ...(payload ?? {}) }
      delete safePayload['arguments']
      return { agentKind: 'codex', event: 'tool:start', sessionId, cwd, transcriptPath: null, timestamp, raw: { ...line, payload: safePayload } }
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
    return { agentKind: 'codex', event: mapped, sessionId, cwd, transcriptPath: null, timestamp, raw: line }
  }

  return null
}

/** Parse a single JSONL transcript line; tolerant of unknown shapes. */
export function normalizeTranscriptLine(line: string, agentKind: AgentKind): ObservedAgentEvent | null {
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

/** Basename of a path-like string; used for display-safe session labels. */
export function displayPath(cwd: string): string {
  const cleaned = cwd.replace(/[\\/]+$/, '')
  const idx = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'))
  const base = idx >= 0 ? cleaned.slice(idx + 1) : cleaned
  return base || 'workspace'
}
