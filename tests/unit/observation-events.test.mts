import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHookEvent, normalizeTranscriptLine, displayPath, toPublicEvent } from '../../src/main/services/observation/agent-events.ts'

test('hook: SessionStart maps to session:start (claude-code)', () => {
  const e = normalizeHookEvent({ hook_event_name: 'SessionStart', session_id: 's1', cwd: 'C:\\proj' }, true)
  assert.ok(e)
  assert.equal(e!.event, 'session:start')
  assert.equal(e!.agentKind, 'claude-code')
})

test('hook: bad token is dropped', () => {
  assert.equal(normalizeHookEvent({ hook_event_name: 'SessionStart', session_id: 's1', cwd: 'C:\\proj' }, false), null)
})

test('hook: missing session_id or cwd is dropped', () => {
  assert.equal(normalizeHookEvent({ hook_event_name: 'SessionStart', cwd: 'C:\\proj' }, true), null)
  assert.equal(normalizeHookEvent({ hook_event_name: 'SessionStart', session_id: 's1' }, true), null)
})

test('hook: PreToolUse keeps only a digest of tool_input', () => {
  const e = normalizeHookEvent(
    { hook_event_name: 'PreToolUse', session_id: 's1', cwd: 'C:\\proj', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } },
    true
  )
  assert.ok(e)
  assert.equal(e!.toolName, 'Bash')
  assert.ok(e!.toolInputDigest)
  assert.equal(e!.toolInputDigest!.length, 16)
  assert.ok(!JSON.stringify(e!.raw).includes('rm -rf /'))
})

test('hook: unknown event name is dropped', () => {
  assert.equal(normalizeHookEvent({ hook_event_name: 'FutureEvent', session_id: 's1', cwd: 'C:\\proj' }, true), null)
})

test('transcript claude: user line maps to user:prompt', () => {
  const e = normalizeTranscriptLine(JSON.stringify({ type: 'user', sessionId: 's1', cwd: 'C:\\proj' }), 'claude-code')
  assert.ok(e)
  assert.equal(e!.event, 'user:prompt')
})

test('transcript claude: assistant line maps to assistant:stop', () => {
  const e = normalizeTranscriptLine(JSON.stringify({ type: 'assistant', sessionId: 's1', cwd: 'C:\\proj' }), 'claude-code')
  assert.ok(e)
  assert.equal(e!.event, 'assistant:stop')
})

test('transcript claude: malformed JSON returns null', () => {
  assert.equal(normalizeTranscriptLine('{not json', 'claude-code'), null)
})

test('transcript codex: session_meta maps to session:start', () => {
  const line = JSON.stringify({ timestamp: 1, type: 'session_meta', payload: { id: 'x1', cwd: 'C:\\w', originator: 'cli' } })
  const e = normalizeTranscriptLine(line, 'codex')
  assert.ok(e)
  assert.equal(e!.event, 'session:start')
  assert.equal(e!.sessionId, 'x1')
  assert.equal(e!.agentKind, 'codex')
})

test('transcript codex: task_complete maps to assistant:stop', () => {
  const line = JSON.stringify({ timestamp: 1, type: 'event_msg', payload: { type: 'task_complete', sessionId: 'x1', cwd: 'C:\\w' } })
  const e = normalizeTranscriptLine(line, 'codex')
  assert.ok(e)
  assert.equal(e!.event, 'assistant:stop')
})

test('transcript codex: unknown type is skipped', () => {
  const line = JSON.stringify({ timestamp: 1, type: 'something_future', payload: { type: 'weird', sessionId: 'x1', cwd: 'C:\\w' } })
  assert.equal(normalizeTranscriptLine(line, 'codex'), null)
})

test('displayPath returns basename only', () => {
  assert.equal(displayPath('C:\\Users\\me\\workspace'), 'workspace')
  assert.equal(displayPath('/home/user/proj'), 'proj')
  assert.equal(displayPath('C:\\'), 'C:')
})

test('toPublicEvent drops cwd, transcriptPath, sourcePid and raw (trust boundary)', () => {
  const e = normalizeHookEvent({
    hook_event_name: 'SessionStart', session_id: 's1', cwd: 'C:\\Users\\secret\\proj',
    transcript_path: 'C:\\Users\\secret\\.claude\\projects\\x.jsonl', source_pid: 1234
  }, true)
  assert.ok(e)
  const pub = toPublicEvent(e!)
  assert.equal(pub.sessionId, 's1')
  assert.equal(pub.displayPath, 'proj')
  assert.ok(!('cwd' in pub))
  assert.ok(!('transcriptPath' in pub))
  assert.ok(!('sourcePid' in pub))
  assert.ok(!('raw' in pub))
})

test('transcript raw never retains tool output or message content', () => {
  const line = JSON.stringify({
    type: 'assistant', sessionId: 's1', cwd: 'C:\\proj',
    message: { content: 'SECRET-MESSAGE' },
    toolUseResult: { stdout: 'TOP-SECRET-OUTPUT' }
  })
  const e = normalizeTranscriptLine(line, 'claude-code')
  assert.ok(e)
  const rawStr = JSON.stringify(e!.raw)
  assert.ok(!rawStr.includes('SECRET-MESSAGE'))
  assert.ok(!rawStr.includes('TOP-SECRET-OUTPUT'))
})

test('codex transcript raw never retains tool arguments', () => {
  const line = JSON.stringify({
    timestamp: 1, type: 'response_item',
    payload: { type: 'function_call', sessionId: 'x1', cwd: 'C:\\w', arguments: { command: 'secret-arg' } }
  })
  const e = normalizeTranscriptLine(line, 'codex')
  assert.ok(e)
  assert.equal(e!.event, 'tool:start')
  assert.ok(!JSON.stringify(e!.raw).includes('secret-arg'))
})
