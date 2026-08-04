import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildAllowlistedEnv,
  ControlledVerificationManager,
  type ControlledVerificationManagerOptions
} from '../../src/main/services/controlled-verification-manager.ts'
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
