import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AutoVerifier, cwdEquals } from '../../src/main/services/observation/auto-verifier.ts'
import type { CompletedVerificationRecord, ControlledVerificationManager } from '../../src/main/services/controlled-verification-manager.ts'
import type { ObservedAgentEvent } from '../../src/shared/observation-types.ts'
import type { VerificationContract } from '../../src/shared/verification-types.ts'

const CONTRACT: VerificationContract = { title: 't', goal: 'g', allowedPaths: ['src'], forbiddenPaths: [], acceptanceCriteria: ['a'], knownRisks: [] }
const END_EVENT: ObservedAgentEvent = { agentKind: 'claude-code', event: 'session:end', sessionId: 's1', cwd: 'C:\\proj', transcriptPath: null, timestamp: 1, raw: {} }
const RECORD = { execution: { state: 'executed' } } as unknown as CompletedVerificationRecord

function makeVerifier(opts?: { workspace?: string | null; contract?: VerificationContract | null; record?: CompletedVerificationRecord | null }): { verifier: AutoVerifier; completed: CompletedVerificationRecord[] } {
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
    contractProvider: () => (opts?.contract === undefined ? CONTRACT : opts.contract)
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
