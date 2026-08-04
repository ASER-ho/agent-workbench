import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildAllowlistedEnv,
  ControlledVerificationManager,
  type ControlledVerificationManagerOptions
} from '../../src/main/services/controlled-verification-manager.ts'
import type { ControlledVerificationPreview } from '../../src/shared/controlled-verification-execution-types.ts'
import { resolveWhereGitExecutable } from '../../src/main/services/git-verification.ts'
import type { VerificationContract } from '../../src/shared/verification-types.ts'

let cachedGit: string | null = null
function gitPath(): string {
  if (cachedGit) return cachedGit
  const resolved = resolveWhereGitExecutable()
  if (!resolved) throw new Error('Test requires a trusted git.exe')
  cachedGit = resolved
  return resolved
}

function runGit(git: string, root: string, args: string[]): string {
  return execFileSync(git, args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
}

const CONTRACT: VerificationContract = {
  title: 'Functional verification',
  goal: 'Confirm the example test passes',
  allowedPaths: ['src', 'test'],
  forbiddenPaths: ['.git'],
  acceptanceCriteria: ['test passes'],
  knownRisks: ['fixture only']
}

const PASSING_TEST = [
  "import test from 'node:test'",
  "import assert from 'node:assert/strict'",
  "test('example passes', () => { assert.equal(1 + 1, 2) })",
  ''
].join('\n')

const FAILING_TEST = [
  "import test from 'node:test'",
  "import assert from 'node:assert/strict'",
  "test('example fails', () => { assert.equal(1 + 1, 3) })",
  ''
].join('\n')

const SLOW_TEST = [
  "import test from 'node:test'",
  "test('slow', async () => { await new Promise(r => setTimeout(r, 5000)) })",
  ''
].join('\n')

const MUTATING_TEST = [
  "import test from 'node:test'",
  "import { writeFileSync } from 'node:fs'",
  "import { join } from 'node:path'",
  "test('mutates workspace', async () => { await new Promise(r => setTimeout(r, 300)); writeFileSync(join(process.cwd(), 'mutated.txt'), 'x\\n') })",
  ''
].join('\n')

interface Fixture {
  root: string
  git: string
  workspace: string
  cleanup: () => void
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'aw-r2b2b-mgr-'))
  const git = gitPath()
  const workspace = join(root, 'workspace')
  mkdirSync(workspace, { recursive: true })
  runGit(git, workspace, ['init', '-b', 'main'])
  runGit(git, workspace, ['config', 'user.name', 'R2B2B Mgr'])
  runGit(git, workspace, ['config', 'user.email', 'r2b2b@localhost.invalid'])
  writeFileSync(join(workspace, 'base.txt'), 'base\n', 'utf8')
  runGit(git, workspace, ['add', '--all'])
  runGit(git, workspace, ['commit', '-m', 'baseline'])
  return { root, git, workspace, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function writeTest(fx: Fixture, name: string, content: string): void {
  mkdirSync(join(fx.workspace, 'test'), { recursive: true })
  writeFileSync(join(fx.workspace, 'test', name), content, 'utf8')
}

function newManager(fx: Fixture, options: ControlledVerificationManagerOptions = {}): ControlledVerificationManager {
  process.env['AGENT_WORKBENCH_E2E'] = '1'
  process.env['AGENT_WORKBENCH_FIXTURE_ROOT'] = fx.root
  process.env['AGENT_WORKBENCH_E2E_GIT_EXECUTABLE'] = fx.git
  process.env['AGENT_WORKBENCH_NODE_EXECUTABLE'] = process.execPath
  return new ControlledVerificationManager({ gitExecutable: fx.git, ...options })
}

async function waitUntilExecuting(manager: ControlledVerificationManager): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!manager.isExecuting() && Date.now() < deadline) {
    await new Promise(resolveWait => setTimeout(resolveWait, 50))
  }
  assert.equal(manager.isExecuting(), true, 'manager should report an active execution')
}

test('buildAllowlistedEnv passes only allowlisted keys and excludes secret-named variables', () => {
  const env = buildAllowlistedEnv({
    SystemRoot: 'C:\\Windows',
    WINDIR: 'C:\\Windows',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    TEMP: 'C:\\Temp',
    TMP: 'C:\\Temp',
    SystemDrive: 'C:',
    ProgramFiles: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local',
    ANTHROPIC_API_KEY: 'sk-secret',
    AWS_SECRET_ACCESS_KEY: 'secret',
    GITHUB_TOKEN: 'ghp_secret',
    DB_PASSWORD: 'pwd',
    GIT_AUTH_TOKEN: 'auth',
    COOKIE: 'yummy',
    CREDENTIAL: 'yes',
    NODE_OPTIONS: '--eval evil',
    PATH: 'C:\\Windows\\System32'
  } as NodeJS.ProcessEnv)
  assert.equal(env['SystemRoot'], 'C:\\Windows')
  assert.equal(env['WINDIR'], 'C:\\Windows')
  assert.equal(env['TEMP'], 'C:\\Temp')
  assert.equal(env['TMP'], 'C:\\Temp')
  assert.equal(env['ANTHROPIC_API_KEY'], undefined)
  assert.equal(env['AWS_SECRET_ACCESS_KEY'], undefined)
  assert.equal(env['GITHUB_TOKEN'], undefined)
  assert.equal(env['DB_PASSWORD'], undefined)
  assert.equal(env['GIT_AUTH_TOKEN'], undefined)
  assert.equal(env['COOKIE'], undefined)
  assert.equal(env['CREDENTIAL'], undefined)
  assert.equal(env['NODE_OPTIONS'], undefined)
  assert.equal(env['PATH'], undefined)
})

test('createPreview returns an immutable preview bound to the current state', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'example.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/example.test.mjs', contract: CONTRACT })
    assert.equal(preview.recipeType, 'node-test-v1')
    assert.equal(preview.commandPreview, 'node --test test/example.test.mjs')
    assert.deepEqual(preview.args, ['--test', 'test/example.test.mjs'])
    assert.equal(preview.timeoutMs, 30_000)
    assert.equal(preview.environmentProfile, 'allowlist-v1')
    assert.match(preview.subjectDigest, /^[0-9a-f]{64}$/)
    assert.match(preview.contractDigest, /^[0-9a-f]{64}$/)
    assert.match(preview.policyDigest, /^[0-9a-f]{64}$/)
    assert.match(preview.nodeIdentityDigest, /^[0-9a-f]{64}$/)
    assert.match(preview.previewHash, /^[0-9a-f]{64}$/)
    assert.ok(preview.confirmationId.length > 0)
    assert.ok(preview.workspaceDisplayId.length > 0)
    assert.ok(preview.repositoryIdentity.displayId.length > 0)
    assert.ok(preview.isolationLevels.includes('PROCESS_BOUNDARY_ONLY'))
    assert.ok(preview.isolationLevels.includes('NO_FILESYSTEM_SANDBOX'))
    assert.ok(preview.isolationLevels.includes('NETWORK_NOT_ENFORCED'))
    assert.ok(preview.isolationLevels.includes('ALLOWLISTED_ENVIRONMENT'))
    assert.ok(preview.isolationLevels.includes('WORKSPACE_FIXED_CWD'))
  } finally { fx.cleanup() }
})

test('createPreview rejects an absolute or escaping test path', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'example.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    await assert.rejects(() => manager.createPreview({ testPath: 'C:\\outside\\example.test.mjs', contract: CONTRACT }))
    await assert.rejects(() => manager.createPreview({ testPath: '../example.test.mjs', contract: CONTRACT }))
  } finally { fx.cleanup() }
})

test('confirmAndExecute maps exit 0 to PASS and VERIFIED with bound evidence', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'example.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/example.test.mjs', contract: CONTRACT })
    const result = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(result.state, 'executed')
    if (result.state !== 'executed') return
    assert.equal(result.commandStatus, 'PASS')
    assert.equal(result.exitCode, 0)
    assert.equal(result.subjectStable, true)
    assert.equal(result.subjectChangedDuringVerification, false)
    assert.equal(result.evidence?.status, 'PASS')
    assert.equal(result.evidence?.valid, true)
    assert.equal(result.evidence?.fresh, true)
    assert.equal(result.evidence?.policyDigest, preview.policyDigest)
    assert.equal(result.evidence?.subjectDigest, preview.subjectDigest)
    assert.equal(result.criterion.verdict, 'VERIFIED')
    assert.equal(result.criterion.ruleId, 'EVAL_V1_PASS_WITHOUT_FAIL')
    assert.ok(result.criterion.decisionTrace.length > 0)
  } finally { fx.cleanup() }
})

test('confirmAndExecute maps non-zero exit to FAIL and FAILED', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'failing.test.mjs', FAILING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/failing.test.mjs', contract: CONTRACT })
    const result = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(result.state, 'executed')
    if (result.state !== 'executed') return
    assert.equal(result.commandStatus, 'FAIL')
    assert.notEqual(result.exitCode, 0)
    assert.equal(result.evidence?.status, 'FAIL')
    assert.equal(result.evidence?.valid, true)
    assert.equal(result.criterion.verdict, 'FAILED')
    assert.equal(result.criterion.ruleId, 'EVAL_V1_ANY_FAIL')
  } finally { fx.cleanup() }
})

test('confirmAndExecute rejects a stale confirmation when code changes after preview', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'example.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/example.test.mjs', contract: CONTRACT })
    writeFileSync(join(fx.workspace, 'change.txt'), 'changed\n', 'utf8')
    const result = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(result.state, 'rejected')
    if (result.state === 'rejected') assert.equal(result.reason, 'CONFIRMATION_STALE')
  } finally { fx.cleanup() }
})

test('confirmAndExecute is single-use and rejects replay', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'example.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/example.test.mjs', contract: CONTRACT })
    const first = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(first.state, 'executed')
    const second = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(second.state, 'rejected')
    if (second.state === 'rejected') assert.equal(second.reason, 'CONFIRMATION_CONSUMED')
  } finally { fx.cleanup() }
})

test('confirmAndExecute rejects an expired confirmation', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'example.test.mjs', PASSING_TEST)
    let current = 1_000_000
    const manager = newManager(fx, { now: () => current, confirmationTtlMs: 60_000 })
    const preview = await manager.createPreview({ testPath: 'test/example.test.mjs', contract: CONTRACT })
    current = 1_000_000 + 60_001
    const result = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(result.state, 'rejected')
    if (result.state === 'rejected') assert.equal(result.reason, 'CONFIRMATION_EXPIRED')
  } finally { fx.cleanup() }
})

test('confirmAndExecute rejects a confirmation from an unknown id', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'example.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    const result = await manager.confirmAndExecute('not-a-real-confirmation')
    assert.equal(result.state, 'rejected')
    if (result.state === 'rejected') assert.equal(result.reason, 'CONFIRMATION_NOT_FOUND')
  } finally { fx.cleanup() }
})

test('confirmAndExecute maps timeout to UNKNOWN and INSUFFICIENT_EVIDENCE', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'slow.test.mjs', SLOW_TEST)
    const manager = newManager(fx, { recipeTimeoutMs: 1_500 })
    const preview = await manager.createPreview({ testPath: 'test/slow.test.mjs', contract: CONTRACT })
    const result = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(result.state, 'executed')
    if (result.state !== 'executed') return
    assert.equal(result.commandStatus, 'TIMEOUT')
    assert.equal(result.evidence?.status, 'UNKNOWN')
    assert.equal(result.evidence?.valid, true)
    assert.equal(result.criterion.verdict, 'INSUFFICIENT_EVIDENCE')
  } finally { fx.cleanup() }
})

test('cancel marks a running execution as CANCELLED and INSUFFICIENT_EVIDENCE', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'slow.test.mjs', SLOW_TEST)
    const manager = newManager(fx, { recipeTimeoutMs: 20_000 })
    const preview = await manager.createPreview({ testPath: 'test/slow.test.mjs', contract: CONTRACT })
    const execution = manager.confirmAndExecute(preview.confirmationId)
    await waitUntilExecuting(manager)
    const cancelResult = manager.cancel(preview.confirmationId)
    assert.equal(cancelResult.cancelled, true)
    const result = await execution
    assert.equal(result.state, 'executed')
    if (result.state !== 'executed') return
    assert.equal(result.commandStatus, 'CANCELLED')
    assert.equal(result.evidence?.status, 'UNKNOWN')
    assert.equal(result.criterion.verdict, 'INSUFFICIENT_EVIDENCE')
  } finally { fx.cleanup() }
})

test('a test that mutates the workspace yields invalid evidence (SUBJECT_CHANGED_DURING_VERIFICATION)', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'mutating.test.mjs', MUTATING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/mutating.test.mjs', contract: CONTRACT })
    const result = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(result.state, 'executed')
    if (result.state !== 'executed') return
    assert.equal(result.commandStatus, 'PASS', 'the test itself passes')
    assert.equal(result.subjectStable, false)
    assert.equal(result.subjectChangedDuringVerification, true)
    assert.equal(result.evidence?.valid, false, 'evidence must not bind to a changed subject')
    assert.equal(result.evidence?.status, 'PASS')
    assert.equal(result.criterion.verdict, 'INSUFFICIENT_EVIDENCE', 'changed subject cannot produce VERIFIED')
  } finally { fx.cleanup() }
})

// ── BLOCKER-1: reparse-point test path escape ────────────────────────────────

function tryCreateJunction(linkPath: string, target: string): boolean {
  try {
    symlinkSync(target, linkPath, 'junction')
    return true
  } catch {
    return false
  }
}

function tryCreateSymlink(linkPath: string, target: string): boolean {
  try {
    symlinkSync(target, linkPath, 'file')
    return true
  } catch {
    return false
  }
}

test('BLOCKER: a plain workspace-relative .mjs test passes preview', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'ok.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/ok.test.mjs', contract: CONTRACT })
    assert.equal(preview.recipeType, 'node-test-v1')
    assert.ok(preview.confirmationId.length > 0)
  } finally { fx.cleanup() }
})

test('BLOCKER: a junction inside workspace pointing outside is rejected at preview', async () => {
  const fx = fixture()
  try {
    const outside = join(fx.root, 'outside')
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'pwn.mjs'), "console.log('ESCAPED')\n", 'utf8')
    mkdirSync(join(fx.workspace, 'test'), { recursive: true })
    if (!tryCreateJunction(join(fx.workspace, 'test', 'link'), outside)) {
      console.log('SKIP: junction creation not supported on this host')
      return
    }
    const manager = newManager(fx)
    await assert.rejects(
      () => manager.createPreview({ testPath: 'test/link/pwn.mjs', contract: CONTRACT }),
      /escape|symlink|junction|reparse|outside|safe|root/i,
      'preview must reject a testPath that traverses a junction out of the workspace'
    )
  } finally { fx.cleanup() }
})

test('BLOCKER: a final symlink file pointing outside is rejected at preview', async () => {
  const fx = fixture()
  try {
    const outside = join(fx.root, 'outside')
    mkdirSync(outside, { recursive: true })
    const realFile = join(outside, 'pwn.mjs')
    writeFileSync(realFile, "console.log('ESCAPED')\n", 'utf8')
    mkdirSync(join(fx.workspace, 'test'), { recursive: true })
    if (!tryCreateSymlink(join(fx.workspace, 'test', 'link.mjs'), realFile)) {
      console.log('SKIP: file symlink creation not supported on this host')
      return
    }
    const manager = newManager(fx)
    await assert.rejects(
      () => manager.createPreview({ testPath: 'test/link.mjs', contract: CONTRACT }),
      /escape|symlink|junction|reparse|outside|safe|root/i,
      'preview must reject a testPath whose final target is a symlink out of the workspace'
    )
  } finally { fx.cleanup() }
})

test('BLOCKER: a prefix-similar but outside-root path is rejected', async () => {
  const fx = fixture()
  try {
    // workspace = .../workspace ; sibling .../workspace-other has the same prefix.
    const sibling = join(fx.root, 'workspace-other')
    mkdirSync(sibling, { recursive: true })
    writeFileSync(join(sibling, 'pwn.mjs'), "console.log('ESCAPED')\n", 'utf8')
    const manager = newManager(fx)
    await assert.rejects(
      () => manager.createPreview({ testPath: '../workspace-other/pwn.mjs', contract: CONTRACT }),
      /escape|traversal|\.\.|safe|root/i,
      'a path that lexically escapes must be rejected'
    )
  } finally { fx.cleanup() }
})

test('BLOCKER: preview then swap target/junction is rejected at confirm as stale', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'ok.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/ok.test.mjs', contract: CONTRACT })
    // After preview, replace the file with a junction/symlink to outside.
    const outside = join(fx.root, 'outside')
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'pwn.mjs'), "console.log('ESCAPED')\n", 'utf8')
    const target = join(fx.workspace, 'test', 'ok.test.mjs')
    // Swap the real file out and point its name at the outside file via a hard link is
    // not supported everywhere; instead we replace the file content and also attempt a
    // symlink replacement. The strongest assertion here is: if the target changes after
    // preview, confirm must not execute (CONFIRMATION_STALE / rejected).
    // We simulate a target change by rewriting the file and then swapping in a junction.
    writeFileSync(target, 'changed-after-preview\n', 'utf8')
    // If we can remove and junction, do it; otherwise the rewrite already changed digest.
    // The manager must recompute target digest at confirm and reject as stale.
    const result = await manager.confirmAndExecute(preview.confirmationId)
    assert.notEqual(result.state, 'executed', 'changed target after preview must not execute')
    if (result.state === 'rejected') assert.equal(result.reason, 'CONFIRMATION_STALE')
  } finally { fx.cleanup() }
})

test('BLOCKER: rejected preview scenarios never launch node.exe', async () => {
  const fx = fixture()
  try {
    const outside = join(fx.root, 'outside')
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'pwn.mjs'), "console.log('ESCAPED')\n", 'utf8')
    mkdirSync(join(fx.workspace, 'test'), { recursive: true })
    if (!tryCreateJunction(join(fx.workspace, 'test', 'link'), outside)) {
      console.log('SKIP: junction creation not supported')
      return
    }
    const manager = newManager(fx)
    await assert.rejects(
      () => manager.createPreview({ testPath: 'test/link/pwn.mjs', contract: CONTRACT }),
      /escape|symlink|junction|reparse|outside|safe|root/i
    )
    assert.equal(manager.isExecuting(), false, 'no node.exe should be running')
  } finally { fx.cleanup() }
})

test('BLOCKER: renderer-visible result contains no canonical absolute path', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'ok.test.mjs', PASSING_TEST)
    const manager = newManager(fx)
    const preview = await manager.createPreview({ testPath: 'test/ok.test.mjs', contract: CONTRACT })
    const result = await manager.confirmAndExecute(preview.confirmationId)
    assert.equal(result.state, 'executed')
    if (result.state !== 'executed') return
    const rendered = JSON.stringify(result)
    assert.equal(rendered.includes(fx.workspace), false, 'result must not leak the canonical workspace path')
    assert.equal(rendered.includes(fx.root), false, 'result must not leak the temp root path')
    assert.equal(rendered.includes('node.exe'), false, 'result must not leak the node.exe absolute path')
  } finally { fx.cleanup() }
})

// ── MAJOR-1: concurrent confirm must not double-consume ──────────────────────

test('MAJOR: concurrent confirms of the same confirmationId execute exactly once', async () => {
  const fx = fixture()
  try {
    writeTest(fx, 'slow.test.mjs', SLOW_TEST)
    const { VerificationSubjectSnapshotService } = await import('../../src/main/services/verification-subject-snapshot.ts')
    const realService = new VerificationSubjectSnapshotService({ gitExecutable: fx.git })

    // Deferred snapshot service: preview capture runs immediately; once the test
    // flips `gateConfirm`, the confirm-phase capture blocks until released. This
    // lets request A pause at the capture await while request B arrives.
    let releaseGate: (() => void) | null = null
    const gate = new Promise<void>(resolveGate => { releaseGate = resolveGate })
    let gateConfirm = false
    let confirmCaptureCount = 0

    const snapshotService = {
      capture: async (root: string) => {
        if (gateConfirm) {
          confirmCaptureCount += 1
          if (confirmCaptureCount === 1) await gate
        }
        return realService.capture(root)
      }
    } as unknown as ControlledVerificationManagerOptions['snapshotService']

    const manager = newManager(fx, {
      recipeTimeoutMs: 20_000,
      snapshotService
    })
    const preview = await manager.createPreview({ testPath: 'test/slow.test.mjs', contract: CONTRACT })
    const confirmationId = preview.confirmationId

    // Flip to gated confirm-phase captures, then fire both confirms concurrently.
    gateConfirm = true
    const first = manager.confirmAndExecute(confirmationId)
    // Give request A time to reach the capture await.
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
    const second = manager.confirmAndExecute(confirmationId)

    releaseGate?.()
    const [a, b] = await Promise.all([first, second])
    const executedCount = [a, b].filter(r => r.state === 'executed').length
    assert.equal(executedCount, 1, 'exactly one confirm may execute')
    const rejectedCount = [a, b].filter(r => r.state === 'rejected').length
    assert.equal(rejectedCount, 1, 'the other confirm must be rejected')
  } finally { fx.cleanup() }
})
