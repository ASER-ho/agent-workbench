import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AutoVerifier,
  cwdEquals,
  type AutoVerificationAuditEntry
} from '../../src/main/services/observation/auto-verifier.ts'
import type { CompletedVerificationRecord, ControlledVerificationManager } from '../../src/main/services/controlled-verification-manager.ts'
import type { VerificationContract } from '../../src/shared/verification-types.ts'
import type { WorkspaceBinding } from '../../src/main/services/workspace-foundation/workspace-types.ts'
import type { RememberedContractSnapshot } from '../../src/main/services/observation/contract-store.ts'
import type { RegisteredRecipe } from '../../src/main/services/observation/recipe-registry-types.ts'
import type { ObservedAgentEventInternal } from '../../src/main/services/observation/agent-events.ts'

const CONTRACT: VerificationContract = { title: 't', goal: 'g', allowedPaths: ['src'], forbiddenPaths: [], acceptanceCriteria: ['a'], knownRisks: [] }
const END_EVENT: ObservedAgentEventInternal = { agentKind: 'claude-code', event: 'session:end', sessionId: 'complete-agent-session-id', cwd: 'C:\\proj', displayPath: 'proj', transcriptPath: null, timestamp: 1, raw: {} }
const RECORD = { execution: { state: 'executed', criterion: { verdict: 'VERIFIED' } }, preview: { workspaceDisplayId: 'proj #12345678' } } as unknown as CompletedVerificationRecord
const WORKSPACE: WorkspaceBinding = { workspaceId: 'ws_1234567890abcdef', workspaceDisplayId: 'proj #12345678', cwd: 'C:\\proj' }
const SNAPSHOT: RememberedContractSnapshot = { contract: CONTRACT, digest: 'a'.repeat(64), generation: 1 }
const RECIPE: RegisteredRecipe = { id: 'project-default-check', label: 'Project default check', testPath: 'test/verify.spec.mjs', timeoutMs: 30_000 }

function makeVerifier(opts?: {
  workspace?: WorkspaceBinding | null
  contract?: RememberedContractSnapshot
  recipes?: RegisteredRecipe[]
  record?: CompletedVerificationRecord | null
  managerFails?: boolean
  auditFailsOn?: AutoVerificationAuditEntry['event']
}): {
  verifier: AutoVerifier
  completed: CompletedVerificationRecord[]
  audits: AutoVerificationAuditEntry[]
  calls: { preview: number; execute: number }
  state: { workspace: WorkspaceBinding | null; contract: RememberedContractSnapshot; recipes: RegisteredRecipe[] }
} {
  const completed: CompletedVerificationRecord[] = []
  const audits: AutoVerificationAuditEntry[] = []
  const calls = { preview: 0, execute: 0 }
  const state = {
    workspace: opts?.workspace === undefined ? WORKSPACE : opts.workspace,
    contract: opts?.contract ?? SNAPSHOT,
    recipes: opts?.recipes ?? [RECIPE]
  }
  const fakeManager = {
    createPreview: async () => {
      calls.preview++
      if (opts?.managerFails) throw new Error('fixture failure containing C:\\secret')
      return { confirmationId: 'c1' }
    },
    confirmAndExecute: async () => { calls.execute++; return {} },
    getCompletedVerification: () => (opts?.record === null ? null : (opts?.record ?? RECORD))
  } as unknown as ControlledVerificationManager
  const verifier = new AutoVerifier({
    manager: fakeManager,
    onCompleted: (record) => completed.push(record),
    workspaceProvider: () => state.workspace,
    contractProvider: () => state.contract,
    recipeProvider: () => state.recipes,
    auditWriter: (entry) => {
      if (entry.event === opts?.auditFailsOn) throw new Error('audit unavailable')
      audits.push(entry)
    },
    now: () => 100
  })
  return { verifier, completed, audits, calls, state }
}

function arm(verifier: AutoVerifier, recipeIds = ['project-default-check']): void {
  verifier.enable({ autoVerifyEnabled: true, workspaceOnly: true, recipeIds })
}

test('cwdEquals normalizes case and trailing slashes', () => {
  assert.equal(cwdEquals('C:\\proj', 'c:\\proj'), true)
  assert.equal(cwdEquals('C:\\proj\\', 'C:\\proj'), true)
  assert.equal(cwdEquals('C:\\proj', 'C:\\other'), false)
})

test('workspace A authorization executes exactly once and turns off', async () => {
  const { verifier, completed, calls } = makeVerifier()
  arm(verifier)
  await Promise.all([verifier.handleEvent(END_EVENT), verifier.handleEvent(END_EVENT)])
  assert.equal(calls.execute, 1)
  assert.equal(completed.length, 1)
  assert.equal(verifier.getSettings().autoVerifyEnabled, false)
  assert.equal(verifier.getSettings().authorization?.state, 'CONSUMED')
})

test('workspace change revokes and workspace B cannot execute', async () => {
  const { verifier, state, calls } = makeVerifier()
  arm(verifier)
  state.workspace = { workspaceId: 'ws_b', workspaceDisplayId: 'other #22222222', cwd: 'C:\\other' }
  verifier.validateBindings()
  assert.equal(verifier.getSettings().authorization?.state, 'REVOKED')
  assert.equal(verifier.getSettings().authorization?.reason, 'WORKSPACE_CHANGED')
  await verifier.handleEvent({ ...END_EVENT, cwd: 'C:\\other' })
  assert.equal(calls.execute, 0)
})

test('workspace clear revokes', () => {
  const { verifier, state } = makeVerifier()
  arm(verifier)
  state.workspace = null
  verifier.validateBindings()
  assert.equal(verifier.getSettings().authorization?.reason, 'WORKSPACE_CLEARED')
})

test('contract generation change revokes even when digest is unchanged', () => {
  const { verifier, state } = makeVerifier()
  arm(verifier)
  state.contract = { ...SNAPSHOT, generation: 2 }
  verifier.validateBindings()
  assert.equal(verifier.getSettings().authorization?.reason, 'CONTRACT_CHANGED')
})

test('recipe registry change revokes', () => {
  const { verifier, state } = makeVerifier()
  arm(verifier)
  state.recipes = []
  verifier.validateBindings()
  assert.equal(verifier.getSettings().authorization?.reason, 'RECIPE_CHANGED')
})

test('observation disable and app exit revoke without persistence', () => {
  const first = makeVerifier().verifier
  arm(first)
  first.disable('OBSERVATION_DISABLED')
  assert.equal(first.getSettings().authorization?.reason, 'OBSERVATION_DISABLED')
  const second = makeVerifier().verifier
  assert.equal(second.getSettings().authorization, null)
  arm(second)
  second.disable('APP_EXITED')
  assert.equal(second.getSettings().authorization?.reason, 'APP_EXITED')
})

test('wrong workspace event does not execute or consume an otherwise valid lease', async () => {
  const { verifier, calls } = makeVerifier()
  arm(verifier)
  await verifier.handleEvent({ ...END_EVENT, cwd: 'C:\\other' })
  assert.equal(calls.execute, 0)
  assert.equal(verifier.getSettings().authorization?.state, 'AUTHORIZED')
})

test('cannot arm without remembered contract', () => {
  const { verifier } = makeVerifier({ contract: { contract: null, digest: null, generation: 1 } })
  assert.throws(() => arm(verifier), /preview/i)
})

test('cannot arm without registered recipe', () => {
  const { verifier } = makeVerifier({ recipes: [] })
  assert.throws(() => arm(verifier), /registered/i)
})

test('audit records grant consume start and completion with minimized fields', async () => {
  const { verifier, audits } = makeVerifier()
  arm(verifier)
  await verifier.handleEvent(END_EVENT)
  assert.deepEqual(audits.map((entry) => entry.event), [
    'authorization_granted', 'authorization_consumed', 'auto_run_started', 'auto_run_completed'
  ])
  const serialized = JSON.stringify(audits)
  assert.ok(!serialized.includes(END_EVENT.sessionId))
  assert.ok(!serialized.includes(END_EVENT.cwd))
  assert.ok(!serialized.includes('transcriptPath'))
  assert.ok(!serialized.includes('raw'))
  assert.ok(!serialized.includes('tool_input'))
  assert.equal(audits[1].sessionIdDigest?.length, 16)
})

test('revocation and controlled verification failure are audited without raw errors', async () => {
  const revoked = makeVerifier()
  arm(revoked.verifier)
  revoked.verifier.disable('USER_DISABLED')
  assert.equal(revoked.audits.at(-1)?.event, 'authorization_revoked')
  assert.equal(revoked.audits.at(-1)?.reason, 'USER_DISABLED')

  const failed = makeVerifier({ managerFails: true })
  arm(failed.verifier)
  await failed.verifier.handleEvent(END_EVENT)
  assert.equal(failed.audits.at(-1)?.event, 'auto_run_failed')
  assert.equal(failed.audits.at(-1)?.reason, 'CONTROLLED_VERIFICATION_FAILED')
  assert.ok(!JSON.stringify(failed.audits).includes('secret'))
})

test('grant audit unavailable prevents authorization', () => {
  const { verifier } = makeVerifier({ auditFailsOn: 'authorization_granted' })
  assert.throws(() => arm(verifier), /AUDIT_UNAVAILABLE/)
  assert.equal(verifier.getSettings().authorization, null)
  assert.equal(verifier.getAuditHealth().state, 'DEGRADED')
})

test('pre-run consume or start audit unavailable fails closed after consuming', async () => {
  for (const event of ['authorization_consumed', 'auto_run_started'] as const) {
    const { verifier, calls } = makeVerifier({ auditFailsOn: event })
    arm(verifier)
    await verifier.handleEvent(END_EVENT)
    assert.equal(calls.preview, 0)
    assert.equal(calls.execute, 0)
    assert.equal(verifier.getSettings().authorization?.state, 'CONSUMED')
    assert.equal(verifier.getAuditHealth().state, 'DEGRADED')
  }
})

test('result audit failure does not undo completed verification and exposes degraded health', async () => {
  const { verifier, completed } = makeVerifier({ auditFailsOn: 'auto_run_completed' })
  arm(verifier)
  await verifier.handleEvent(END_EVENT)
  assert.equal(completed.length, 1)
  assert.ok(verifier.getLastReceipt())
  assert.equal(verifier.getAuditHealth().state, 'DEGRADED')
})
