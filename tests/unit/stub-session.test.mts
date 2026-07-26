import test from 'node:test'
import assert from 'node:assert/strict'
import { AgentSessionManager } from '../../src/main/services/agent-session.ts'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(predicate: () => boolean, message: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await delay(20)
  }
  throw new Error(message)
}

function createManager(timeoutMs = 250, startDelayMs = 0): AgentSessionManager {
  return new AgentSessionManager({ executablePath: process.execPath, responseTimeoutMs: timeoutMs, startDelayMs, fixtureMarker: 'stage-b-unit-fixture' })
}

test('Stage B readiness and confirmation bind a safe immutable launch plan', async () => {
  const manager = createManager()
  try {
    const windowsAbsolute = ['C:', 'private', 'workspace'].join('\\\\')
    const blocked = manager.getReadiness({ workspaceLabel: windowsAbsolute })
    const blockedPosix = manager.getReadiness({ workspaceLabel: '/private/workspace' })
    const blockedTraversal = manager.getReadiness({ workspaceLabel: '../private-workspace' })
    assert.equal(blocked.workspaceSelected, false)
    assert.equal(blocked.readyToPrepare, false)
    assert.equal(blockedPosix.workspaceSelected, false)
    assert.equal(blockedTraversal.workspaceSelected, false)

    const initial = manager.getReadiness({ workspaceLabel: 'fixture-project' })
    assert.equal(initial.executableAvailable, true)
    assert.equal(initial.providerKnown, true)
    assert.equal(initial.modelKnown, true)
    assert.equal(initial.safetySatisfied, true)
    assert.equal(initial.noActiveSession, true)
    assert.equal(initial.userConfirmation, false)
    assert.equal(initial.readyToPrepare, true)
    assert.equal(initial.readyToStart, false)

    const plan = manager.prepareLaunch({ workspaceLabel: 'fixture-project' })
    assert.equal(plan.workspaceLabel, 'fixture-project')
    assert.equal(plan.agentLabel, 'Deterministic Stub Agent')
    assert.equal(plan.providerLabel, 'Local Stub')
    assert.equal(plan.modelLabel, 'deterministic-v1')
    assert.ok(plan.executableBasename)
    assert.match(plan.fingerprint, /^[a-f0-9]{64}$/)
    assert.equal(manager.getReadiness({ workspaceLabel: 'fixture-project', confirmationId: plan.confirmationId }).readyToStart, true)
    assert.equal(manager.getReadiness({ workspaceLabel: 'other-project', confirmationId: plan.confirmationId }).userConfirmation, false)
    await assert.rejects(manager.start('wrong-confirmation'), /confirmation/i)
  } finally {
    await manager.dispose()
  }
})

test('Stage B stub session streams input and stops without a child process', async () => {
  const manager = createManager()
  const output: string[] = []
  const statuses: string[] = []
  manager.onData(data => output.push(data))
  manager.onStatus(snapshot => statuses.push(snapshot.status))
  try {
    const plan = manager.prepareLaunch({ workspaceLabel: 'fixture-project' })
    const started = await manager.start(plan.confirmationId)
    assert.equal(started.status, 'running')
    assert.ok(started.pid)

    assert.throws(() => manager.prepareLaunch({ workspaceLabel: 'fixture-project' }), /active session/i)
    await manager.input('hello stage b')
    await waitFor(() => output.join('').includes('hello stage b'), 'stub output was not streamed')

    const stopped = await manager.stop()
    assert.equal(stopped.status, 'stopped')
    assert.equal(stopped.pid, undefined)
    assert.ok(statuses.includes('starting'))
    assert.ok(statuses.includes('running'))
    assert.ok(statuses.includes('stopping'))
    assert.ok(statuses.includes('stopped'))
    await assert.rejects(manager.start(plan.confirmationId), /confirmation/i)
  } finally {
    await manager.dispose()
  }
})

test('Stage B stub crash is observable and a new session can recover', async () => {
  const manager = createManager()
  try {
    const firstPlan = manager.prepareLaunch({ workspaceLabel: 'fixture-project' })
    await manager.start(firstPlan.confirmationId)
    const firstSessionId = manager.getSnapshot().sessionId
    await manager.input('__CRASH__')
    await waitFor(() => manager.getSnapshot().status === 'crashed', 'crash status was not observed')
    assert.equal(manager.getSnapshot().exitCode, 17)
    assert.equal(manager.getSnapshot().pid, undefined)

    const recoveryPlan = manager.prepareLaunch({ workspaceLabel: 'fixture-project' })
    const recovered = await manager.start(recoveryPlan.confirmationId)
    assert.equal(recovered.status, 'running')
    assert.notEqual(recovered.sessionId, firstSessionId)
    await manager.stop()
  } finally {
    await manager.dispose()
  }
})

test('Stage B stub timeout kills the child and records timed_out', async () => {
  const manager = createManager(120)
  try {
    const plan = manager.prepareLaunch({ workspaceLabel: 'fixture-project' })
    await manager.start(plan.confirmationId)
    await manager.input('__TIMEOUT__')
    await waitFor(() => manager.getSnapshot().status === 'timed_out', 'timeout status was not observed')
    const snapshot = manager.getSnapshot()
    assert.equal(snapshot.pid, undefined)
    assert.equal(snapshot.reason, 'response_timeout')
  } finally {
    await manager.dispose()
  }
})

test('Stage B stop timeout retains child ownership until retry completes', async () => {
  const manager = new AgentSessionManager({
    executablePath: process.execPath,
    responseTimeoutMs: 250,
    stopGraceMs: 20,
    stopKillWaitMs: 20,
    fixtureMarker: 'stage-b-unit-fixture'
  })
  const plan = manager.prepareLaunch({ workspaceLabel: 'fixture-project' })
  await manager.start(plan.confirmationId)
  const child = (manager as unknown as { child: NodeJS.EventEmitter & {
    pid?: number
    stdin: { write: (...args: unknown[]) => boolean }
    kill: (...args: unknown[]) => boolean
  } | null }).child
  assert.ok(child)
  const originalWrite = child.stdin.write.bind(child.stdin)
  const originalKill = child.kill.bind(child)
  child.stdin.write = () => true
  child.kill = () => false

  try {
    const timedOut = await manager.stop()
    assert.equal(timedOut.status, 'error')
    assert.equal(timedOut.reason, 'stop_timeout')
    assert.equal(timedOut.pid, child.pid)
    assert.equal(manager.getReadiness({ workspaceLabel: 'fixture-project' }).noActiveSession, false)
    assert.throws(() => manager.prepareLaunch({ workspaceLabel: 'fixture-project' }), /active session/i)

    child.stdin.write = originalWrite
    child.kill = originalKill
    const retried = await manager.stop()
    assert.equal(retried.status, 'stopped')
    assert.equal(retried.pid, undefined)
    assert.equal(manager.getReadiness({ workspaceLabel: 'fixture-project' }).noActiveSession, true)
  } finally {
    child.stdin.write = originalWrite
    child.kill = originalKill
    await manager.dispose()
  }
})

test('Stage B dispose during starting cancels launch and leaves no active child', async () => {
  const manager = createManager(250, 250)
  const plan = manager.prepareLaunch({ workspaceLabel: 'fixture-project' })
  const startResult = manager.start(plan.confirmationId).then(
    () => 'unexpected-success',
    () => 'cancelled'
  )
  await manager.dispose()
  assert.equal(await startResult, 'cancelled')
  const snapshot = manager.getSnapshot()
  assert.equal(snapshot.status, 'stopped')
  assert.equal(snapshot.pid, undefined)
})
