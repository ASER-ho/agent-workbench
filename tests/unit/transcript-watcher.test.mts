import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TranscriptWatcher } from '../../src/main/services/observation/transcript-watcher.ts'
import type { ObservedAgentEvent } from '../../src/shared/observation-types.ts'

function waitFor(predicate: () => boolean, timeout = 4000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = (): void => {
      if (predicate()) resolve()
      else if (Date.now() - start > timeout) reject(new Error('waitFor timeout'))
      else setTimeout(check, 25)
    }
    check()
  })
}

function fixture(): { root: string; claude: string; codex: string } {
  const root = mkdtempSync(join(tmpdir(), 'aw-obs-'))
  const claude = join(root, '.claude', 'projects')
  const codex = join(root, '.codex', 'sessions')
  mkdirSync(claude, { recursive: true })
  mkdirSync(codex, { recursive: true })
  return { root, claude, codex }
}

test('watcher tails a Claude transcript and emits events incrementally', async () => {
  const fx = fixture()
  const events: ObservedAgentEvent[] = []
  const w = new TranscriptWatcher()
  w.onEvent((e) => events.push(e))
  await w.start({ claudeProjects: fx.claude, codexSessions: fx.codex })

  const dir = join(fx.claude, 'C--proj')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'abc.jsonl')
  writeFileSync(file, JSON.stringify({ type: 'user', sessionId: 's1', cwd: 'C:\\proj' }) + '\n', 'utf8')
  await waitFor(() => events.length >= 1)
  assert.equal(events[0].event, 'user:prompt')

  appendFileSync(file, JSON.stringify({ type: 'assistant', sessionId: 's1', cwd: 'C:\\proj' }) + '\n', 'utf8')
  await waitFor(() => events.length >= 2)
  assert.equal(events[1].event, 'assistant:stop')

  await w.stop()
  rmSync(fx.root, { recursive: true, force: true })
})

test('watcher parses a Codex rollout as codex kind', async () => {
  const fx = fixture()
  const events: ObservedAgentEvent[] = []
  const w = new TranscriptWatcher()
  w.onEvent((e) => events.push(e))
  await w.start({ claudeProjects: fx.claude, codexSessions: fx.codex })

  const dir = join(fx.codex, '2026', '08', '12')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'rollout-1-abc.jsonl')
  writeFileSync(file, JSON.stringify({ timestamp: 1, type: 'session_meta', payload: { id: 'x1', cwd: 'C:\\w' } }) + '\n', 'utf8')
  await waitFor(() => events.length >= 1)
  assert.equal(events[0].agentKind, 'codex')
  assert.equal(events[0].event, 'session:start')

  await w.stop()
  rmSync(fx.root, { recursive: true, force: true })
})

test('watcher ignores non-jsonl files and survives malformed lines', async () => {
  const fx = fixture()
  const events: ObservedAgentEvent[] = []
  const w = new TranscriptWatcher()
  w.onEvent((e) => events.push(e))
  await w.start({ claudeProjects: fx.claude, codexSessions: fx.codex })

  const dir = join(fx.claude, 'C--proj')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'notes.txt'), 'not a transcript', 'utf8')
  const file = join(dir, 'x.jsonl')
  writeFileSync(file, '{bad line\n' + JSON.stringify({ type: 'user', sessionId: 's2', cwd: 'C:\\proj' }) + '\n', 'utf8')
  await waitFor(() => events.length >= 1)
  assert.equal(events[0].event, 'user:prompt')

  await w.stop()
  rmSync(fx.root, { recursive: true, force: true })
})
