import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ControlledActionManager, sanitizeForShare } from '../../src/main/services/controlled-action.ts'
import type { SessionSnapshot } from '../../src/shared/session-types.ts'

function runningSession(id = 'session-1'): SessionSnapshot {
  return {
    adapterId: 'stub', agentLabel: 'Deterministic Stub Agent', providerLabel: 'Local Stub',
    modelLabel: 'deterministic-v1', executableBasename: 'node.exe', sessionId: id,
    workspaceLabel: 'fixture-project', status: 'running', updatedAt: Date.now()
  }
}

function fixture(): { root: string; session: { current: SessionSnapshot }; manager: ControlledActionManager; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-stage-c-unit-'))
  const session = { current: runningSession() }
  const manager = new ControlledActionManager({
    workspaceRoot: root,
    getSessionSnapshot: () => session.current,
    executablePath: process.execPath,
    marker: 'agent-workbench-stage-c-unit'
  })
  return { root, session, manager, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('Stage C proposals expose safe command/file previews and bind approval to exact immutable context', async () => {
  const fx = fixture()
  try {
    const command = fx.manager.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
    assert.equal(command.actionType, 'command')
    assert.equal(command.sessionId, 'session-1')
    assert.equal(command.preview.kind, 'command')
    assert.ok(command.proposalId && command.workspaceId && command.proposalHash && command.createdAt)
    assert.equal(command.exactTarget.includes('\\'), false)

    const file = fx.manager.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
    assert.equal(file.preview.kind, 'file_change')
    assert.match(file.preview.diff, /^--- \/dev\/null/m)
    assert.equal(file.exactTarget, 'stage-c/receipt-proof.txt')

    assert.throws(() => fx.manager.approve({
      proposalId: command.proposalId, proposalHash: command.proposalHash,
      sessionId: command.sessionId, workspaceId: command.workspaceId
    }), /proposal/i)
    assert.throws(() => fx.manager.approve({
      proposalId: file.proposalId, proposalHash: `${file.proposalHash.startsWith('0') ? '1' : '0'}${file.proposalHash.slice(1)}`,
      sessionId: file.sessionId, workspaceId: file.workspaceId
    }), /binding/i)

    const approval = fx.manager.approve({
      proposalId: file.proposalId, proposalHash: file.proposalHash,
      sessionId: file.sessionId, workspaceId: file.workspaceId
    })
    assert.equal(approval.proposalHash, file.proposalHash)
    assert.ok(approval.approvalId)
  } finally { fx.cleanup() }
})

test('Stage C reject and cancel write truthful receipts and cannot be replayed', () => {
  const fx = fixture()
  try {
    const rejected = fx.manager.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
    const rejectedReceipt = fx.manager.reject({
      proposalId: rejected.proposalId, proposalHash: rejected.proposalHash,
      sessionId: rejected.sessionId, workspaceId: rejected.workspaceId
    })
    assert.equal(rejectedReceipt.status, 'rejected')
    assert.equal(existsSync(join(fx.root, 'stage-c', 'receipt-proof.txt')), false)
    assert.throws(() => fx.manager.approve({
      proposalId: rejected.proposalId, proposalHash: rejected.proposalHash,
      sessionId: rejected.sessionId, workspaceId: rejected.workspaceId
    }), /proposal/i)

    const cancelled = fx.manager.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
    assert.equal(fx.manager.cancel({
      proposalId: cancelled.proposalId, proposalHash: cancelled.proposalHash,
      sessionId: cancelled.sessionId, workspaceId: cancelled.workspaceId
    }).status, 'cancelled')
    assert.deepEqual(fx.manager.getReceipts().map(item => item.status), ['rejected', 'cancelled'])
  } finally { fx.cleanup() }
})

test('Stage C file execution stays in the approved relative target and emits evidence artifacts', async () => {
  const fx = fixture()
  try {
    const proposal = fx.manager.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
    const approval = fx.manager.approve({
      proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
      sessionId: proposal.sessionId, workspaceId: proposal.workspaceId
    })
    const result = await fx.manager.execute(approval.approvalId)
    const target = join(fx.root, 'stage-c', 'receipt-proof.txt')
    assert.equal(result.receipt.status, 'executed')
    assert.equal(readFileSync(target, 'utf8'), 'Agent Workbench controlled action\n')
    assert.deepEqual(result.receipt.affectedFiles, ['stage-c/receipt-proof.txt'])
    assert.equal(result.receipt.exitCode, 0)
    assert.match(result.diff, /controlled action/)
    assert.match(result.handoff, /## Evidence/)
    assert.match(result.handoff, /## Next step/)
    assert.match(result.safeShare.markdown, /Work Receipt/)
    assert.equal(result.safeShare.markdown.includes(fx.root), false)
  } finally { fx.cleanup() }
})

test('Stage C rejects traversal, forbidden targets and symlink escapes', async () => {
  const cases = ['../escape.txt', '.claude/settings.json']
  for (const fileTargetRelativePath of cases) {
    const root = mkdtempSync(join(tmpdir(), 'agent-workbench-stage-c-boundary-'))
    const manager = new ControlledActionManager({
      workspaceRoot: root, getSessionSnapshot: () => runningSession(),
      fileTargetRelativePath, executablePath: process.execPath
    })
    try { assert.throws(() => manager.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' }), /target/i) }
    finally { rmSync(root, { recursive: true, force: true }) }
  }

  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-stage-c-link-'))
  const outside = mkdtempSync(join(tmpdir(), 'agent-workbench-stage-c-outside-'))
  try {
    mkdirSync(join(root, 'stage-c'), { recursive: true })
    rmSync(join(root, 'stage-c'), { recursive: true, force: true })
    symlinkSync(outside, join(root, 'stage-c'), 'junction')
    const manager = new ControlledActionManager({
      workspaceRoot: root, getSessionSnapshot: () => runningSession(), executablePath: process.execPath
    })
    const proposal = manager.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
    const approval = manager.approve({
      proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
      sessionId: proposal.sessionId, workspaceId: proposal.workspaceId
    })
    const result = await manager.execute(approval.approvalId)
    assert.equal(result.receipt.status, 'failed')
    assert.equal(existsSync(join(outside, 'receipt-proof.txt')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('Stage C command execution is direct, immutable and single-consumption', async () => {
  const fx = fixture()
  try {
    const proposal = fx.manager.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
    const approval = fx.manager.approve({
      proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
      sessionId: proposal.sessionId, workspaceId: proposal.workspaceId
    })
    const outcomes = await Promise.allSettled([
      fx.manager.execute(approval.approvalId), fx.manager.execute(approval.approvalId)
    ])
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1)
    assert.equal(outcomes.filter(item => item.status === 'rejected').length, 1)
    const result = (outcomes.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof fx.manager.execute>>>).value
    assert.equal(result.receipt.status, 'executed')
    assert.equal(result.receipt.stdoutSummary, 'controlled-action:ok')
    assert.equal(result.receipt.affectedFiles.length, 0)
  } finally { fx.cleanup() }
})

test('Stage C share sanitizer removes keys, usernames and full absolute paths', () => {
  const privatePath = join(tmpdir(), 'agent-workbench-private')
  const forwardPrivatePath = privatePath.replace(/\\/g, '/')
  const unixPrivatePath = ['', 'home', 'fixture-user', 'private'].join('/')
  const fakeKey = ['sk', 'abcdefghijklmnopqrstuvwxyz'].join('-')
  const unsafe = `${fakeKey} ${privatePath} ${forwardPrivatePath} ${unixPrivatePath} USERNAME=Alice token=secret-value SecretStore ANTHROPIC_AUTH_TOKEN`
  const safe = sanitizeForShare(unsafe)
  assert.equal(safe.value.includes(fakeKey), false)
  assert.equal(safe.value.includes('Alice'), false)
  assert.equal(safe.value.includes(unixPrivatePath), false)
  assert.equal(safe.value.includes('secret-value'), false)
  assert.ok(safe.redactions.includes('secret'))
  assert.ok(safe.redactions.includes('absolute_path'))
  assert.ok(safe.redactions.includes('username'))
})

test('Stage C approval expires and invalidates when the active Session changes', () => {
  const fx = fixture()
  const originalNow = Date.now
  try {
    let now = 10_000
    Date.now = () => now
    const expiring = fx.manager.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
    now = expiring.expiresAt + 1
    assert.throws(() => fx.manager.approve(binding(expiring)), /expired/i)

    Date.now = originalNow
    const changed = fx.manager.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
    fx.session.current = runningSession('session-2')
    assert.throws(() => fx.manager.approve(binding(changed)), /session/i)
  } finally {
    Date.now = originalNow
    fx.cleanup()
  }
})

test('Stage C runtime locale and preload keep action copy and inputs inside fixed contracts', () => {
  const runtimeLocale = readFileSync('src/renderer/contexts/LocaleContext.tsx', 'utf8')
  const preload = readFileSync('src/preload/index.ts', 'utf8')
  const handler = readFileSync('src/main/ipc/action.ts', 'utf8')
  assert.equal((runtimeLocale.match(/"action\.title"/g) ?? []).length, 2)
  assert.match(preload, /propose: \(input: \{ actionType: ActionType; workspaceLabel: string \}\)/)
  assert.doesNotMatch(preload, /actionType: ActionType;[^}]*executable|actionType: ActionType;[^}]*content/)
  assert.match(handler, /required\(\)\.propose\(\{ actionType: input\?\.actionType, workspaceLabel: input\?\.workspaceLabel \}\)/)
})

function binding(proposal: { proposalId: string; proposalHash: string; sessionId: string; workspaceId: string }) {
  return { proposalId: proposal.proposalId, proposalHash: proposal.proposalHash, sessionId: proposal.sessionId, workspaceId: proposal.workspaceId }
}

test('Stage C consumes expired proposal and approval state so a new proposal can recover', async () => {
  const fx = fixture()
  const originalNow = Date.now
  try {
    let now = 20_000
    Date.now = () => now
    const expiredProposal = fx.manager.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
    now = expiredProposal.expiresAt + 1
    assert.throws(() => fx.manager.approve(binding(expiredProposal)), /expired/i)
    assert.equal(fx.manager.getReceipts().at(-1)?.status, 'cancelled')

    const approvedProposal = fx.manager.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
    const approval = fx.manager.approve(binding(approvedProposal))
    now = approval.expiresAt + 1
    await assert.rejects(fx.manager.execute(approval.approvalId), /expired/i)
    assert.equal(fx.manager.getReceipts().at(-1)?.status, 'cancelled')

    Date.now = originalNow
    const recovered = fx.manager.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
    assert.equal(recovered.actionType, 'file_change')
  } finally {
    Date.now = originalNow
    fx.cleanup()
  }
})

test('Stage C dispose waits for an in-flight file action and cancels before mutation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-workbench-stage-c-file-close-'))
  const session = { current: runningSession() }
  const manager = new ControlledActionManager({
    workspaceRoot: root,
    getSessionSnapshot: () => session.current,
    executablePath: process.execPath,
    fileTargetResolveDelayMs: 120
  })
  try {
    const proposal = manager.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
    const approval = manager.approve(binding(proposal))
    const execution = manager.execute(approval.approvalId)
    await new Promise(resolveDelay => setTimeout(resolveDelay, 20))
    await manager.dispose()
    const result = await execution
    assert.equal(result.receipt.status, 'cancelled')
    assert.equal(existsSync(join(root, 'stage-c', 'receipt-proof.txt')), false)
    assert.equal(manager.isExecuting(), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Stage C replacing an approved proposal cancels its receipt', () => {
  const fx = fixture()
  try {
    const original = fx.manager.propose({ actionType: 'command', workspaceLabel: 'fixture-project' })
    fx.manager.approve(binding(original))
    assert.equal(fx.manager.getReceipts().at(-1)?.status, 'approved')

    fx.manager.propose({ actionType: 'file_change', workspaceLabel: 'fixture-project' })
    const replaced = fx.manager.getReceipts().find(receipt => receipt.proposalId === original.proposalId)
    assert.equal(replaced?.status, 'cancelled')
  } finally {
    fx.cleanup()
  }
})
