import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AutoVerifier, cwdEquals } from '../../src/main/services/observation/auto-verifier.ts'
import type { CompletedVerificationRecord, ControlledVerificationManager } from '../../src/main/services/controlled-verification-manager.ts'
import type { VerificationContract } from '../../src/shared/verification-types.ts'
import type { ObservedAgentEventInternal } from '../../src/main/services/observation/agent-events.ts'

const CONTRACT: VerificationContract = { title: 't', goal: 'g', allowedPaths: ['src'], forbiddenPaths: [], acceptanceCriteria: ['a'], knownRisks: [] }
const END_EVENT: ObservedAgentEventInternal = { agentKind: 'claude-code', event: 'session:end', sessionId: 's1', cwd: 'C:\\proj', displayPath: 'proj', transcriptPath: null, timestamp: 1, raw: {} }
const RECORD = { execution: { state: 'executed', criterion: { verdict: 'VERIFIED' } }, preview: { workspaceDisplayId: 'ws-1' } } as unknown as CompletedVerificationRecord

function makeVerifier(opts?: { workspace?: string | null; contract?: VerificationContract | null; record?: CompletedVerificationRecord | null; auditPath?: string }): { verifier: AutoVerifier; completed: CompletedVerificationRecord[] } {
  const completed: CompletedVerificationRecord[] = []
  const fakeManager = {
    createPreview: async () => ({ confirmationId: 'c1' }),
    confirmAndExecute: async () => ({}),
    getCompletedVerification: () => (opts?.record === null ? null : (opts?.record ?? RECORD))
  } as unknown as ControlledVerificationManager
  const verifier = new AutoVerifier({
    manager: fakeManager,
    onCompleted: (r) => completed.push(r),
    workspaceProvider: () => (opts?.workspace === undefined ? { cwd: 'C:\\proj' } : opts.workspace ? { cwd: opts.workspace } : null),
    contractProvider: () => (opts?.contract === undefined ? CONTRACT : opts.contract),
    auditPath: opts?.auditPath ?? null
  })
  return { verifier, completed }
}

test('cwdEquals normalizes case and trailing slashes', () => {
  assert.equal(cwdEquals('C:\\proj', 'c:\\proj'), true)
  assert.equal(cwdEquals('C:\\proj\\', 'C:\\proj'), true)
  assert.equal(cwdEquals('C:\\proj', 'C:\\other'), false)
})

test('gate: disabled never runs', async () => {
  const { verifier, completed } = makeVerifier()
  await verifier.handleEvent(END_EVENT)
  assert.equal(completed.length, 0)
})

test('gate: non session:end event never runs', async () => {
  const { verifier, completed } = makeVerifier()
  verifier.enable({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds: ['project-default-check'] })
  await verifier.handleEvent({ ...END_EVENT, event: 'assistant:stop' })
  assert.equal(completed.length, 0)
})

test('gate: workspace mismatch never runs', async () => {
  const { verifier, completed } = makeVerifier({ workspace: 'C:\\other' })
  verifier.enable({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds: ['project-default-check'] })
  await verifier.handleEvent(END_EVENT)
  assert.equal(completed.length, 0)
})

test('gate: no contract never runs', async () => {
  const { verifier, completed } = makeVerifier({ contract: null })
  verifier.enable({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds: ['project-default-check'] })
  await verifier.handleEvent(END_EVENT)
  assert.equal(completed.length, 0)
})

test('gate: recipe not in whitelist never runs', async () => {
  const { verifier, completed } = makeVerifier()
  verifier.enable({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds: ['not-in-registry'] })
  await verifier.handleEvent(END_EVENT)
  assert.equal(completed.length, 0)
})

test('gate: all pass produces a receipt', async () => {
  const { verifier, completed } = makeVerifier()
  verifier.enable({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds: ['project-default-check'] })
  await verifier.handleEvent(END_EVENT)
  assert.equal(completed.length, 1)
  assert.ok(verifier.getLastReceipt())
})

test('gate: manager with no completed record produces no receipt', async () => {
  const { verifier, completed } = makeVerifier({ record: null })
  verifier.enable({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds: ['project-default-check'] })
  await verifier.handleEvent(END_EVENT)
  assert.equal(completed.length, 0)
})

test('audit: an auto-run writes a display-safe audit line', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = mkdtempSync(join(tmpdir(), 'aw-audit-'))
  const auditPath = join(root, 'audit.jsonl')
  writeFileSync(auditPath, '', 'utf8')
  const { verifier, completed } = makeVerifier({ auditPath })
  verifier.enable({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds: ['project-default-check'] })
  await verifier.handleEvent(END_EVENT)
  assert.equal(completed.length, 1)
  const lines = readFileSync(auditPath, 'utf8').split('\n').filter(Boolean)
  assert.equal(lines.length, 1)
  const entry = JSON.parse(lines[0])
  assert.equal(entry.trigger, 'auto:session-end')
  assert.equal(entry.recipeId, 'project-default-check')
  assert.equal(entry.verdict, 'VERIFIED')
  assert.equal(entry.sessionId, 's1')
  rmSync(root, { recursive: true, force: true })
})
