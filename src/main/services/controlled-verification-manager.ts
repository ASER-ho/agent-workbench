// Controlled verification manager: immutable preview, one-time confirmation,
// safe execution of a trusted node.exe test command, and fail-closed evidence.
//
// Security invariants (main-process only, never delegated to the renderer):
// - Preview binds: workspace displayId, repository identity, contract digest,
//   policy digest, subject digest, recipe type, test path, trusted node.exe
//   identity digest, fixed args, timeout, environment profile, expiration,
//   confirmationId, previewHash.
// - The renderer may only submit `confirmationId` at confirm time.
// - Confirm is single-use, expires after 5 minutes, is non-replayable, binds to
//   the current workspace, and recomputes the Subject Snapshot before execution
//   (fail-closed). Contract/code changes invalidate the preview immediately.
// - Execution uses an allowlisted environment that excludes variables whose
//   names contain TOKEN/SECRET/PASSWORD/API_KEY/AUTH/COOKIE/CREDENTIAL.
// - The isolation report is truthful: no OS sandbox is claimed.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { PolicyDescriptor, EvidenceStatus, EvidenceItem } from '../../shared/evaluation-types.ts'
import { EVALUATION_POLICY_VERSION, EVAL_RULES } from '../../shared/evaluation-policy-v1.ts'
import { evaluateCriterion } from '../../shared/criterion-evaluator.ts'
import { classifyFreshness } from '../../shared/evidence-freshness-policy-v1.ts'
import type { NodeTestRecipe } from '../../shared/verification-recipe-types.ts'
import { validateNodeTestRecipe } from '../../shared/verification-recipe-types.ts'
import type { VerificationContract } from '../../shared/verification-types.ts'
import { validateVerificationContract } from '../../shared/verification-validation.ts'
import {
  CONTROLLED_VERIFICATION_CONFIRMATION_TTL_MS,
  CONTROLLED_VERIFICATION_CRITERION_ID,
  CONTROLLED_VERIFICATION_DEFAULT_TIMEOUT_MS,
  CONTROLLED_VERIFICATION_ENV_PROFILE,
  CONTROLLED_VERIFICATION_FRESHNESS_MAX_AGE_MS,
  CONTROLLED_VERIFICATION_ISOLATION_LEVELS,
  type ControlledVerificationCancelResult,
  type ControlledVerificationCommandStatus,
  type ControlledVerificationIsolation,
  type ControlledVerificationPreview,
  type ControlledVerificationPreviewRequest,
  type ControlledVerificationResult,
  type ControlledVerificationRejectionReason
} from '../../shared/controlled-verification-execution-types.ts'
import { canonicalStringify, digestPolicyDescriptor, sha256Utf8 } from '../utils/evidence-digest.ts'
import { resolveSafeTestTarget } from './verification-safe-path.ts'
import { sanitizeForShare } from './controlled-action.ts'
import { GitVerificationService } from './git-verification.ts'
import type { TrustedNodeResult } from './trusted-node-executable.ts'
import { resolveTrustedNodeExecutable } from './trusted-node-executable.ts'
import { VerificationSubjectSnapshotService } from './verification-subject-snapshot.ts'
import type { WorkspaceBinding } from './workspace-foundation/workspace-types.ts'
import { getSelectedWorkspaceBinding } from './workspace-foundation/session-workspace.ts'

/** Fixed policy descriptor whose digest is bound into every preview and evidence. */
const POLICY_DESCRIPTOR: PolicyDescriptor = {
  policyVersion: EVALUATION_POLICY_VERSION,
  evaluatorRuleSet: [
    EVAL_RULES.DISABLED,
    EVAL_RULES.UNSUPPORTED,
    EVAL_RULES.ANY_FAIL,
    EVAL_RULES.PASS_WITHOUT_FAIL,
    EVAL_RULES.NO_VALID_EVIDENCE
  ],
  policyDigest: ''
}

const OUTPUT_LIMIT_BYTES = 64 * 1024
const FORBIDDEN_ENV_PART_RE = /TOKEN|SECRET|PASSWORD|API_KEY|AUTH|COOKIE|CREDENTIAL/i
const ENV_ALLOWLIST_KEYS = [
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'TEMP',
  'TMP',
  'SystemDrive',
  'ProgramFiles',
  'LOCALAPPDATA'
] as const

export interface ControlledVerificationManagerOptions {
  workspaceProvider?: () => WorkspaceBinding | null
  nodeResolver?: () => TrustedNodeResult
  now?: () => number
  confirmationTtlMs?: number
  recipeTimeoutMs?: number
  gitExecutable?: string
  snapshotService?: VerificationSubjectSnapshotService
}

interface PendingConfirmation {
  confirmationId: string
  previewHash: string
  workspaceDisplayId: string
  cwd: string
  contractDigest: string
  policyDigest: string
  subjectDigest: string
  recipe: NodeTestRecipe
  /** Canonical absolute target inside the workspace (Main-only, never across IPC). */
  canonicalTarget: string
  /** Digest of the canonical target, bound into the preview hash. */
  targetDigest: string
  /** Display command args for the user (relative path); execution uses canonicalTarget. */
  args: string[]
  node: Extract<TrustedNodeResult, { trusted: true }>
  expiration: number
  used: boolean
}

interface ActiveExecution {
  confirmationId: string
  child: ChildProcessWithoutNullStreams
  cancelRequested: boolean
}

interface CommandRun {
  exitCode: number | null
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  timedOut: boolean
  cancelled: boolean
  spawnError: boolean
}

function parseConfirmationId(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const confirmationId = (raw as Record<string, unknown>)['confirmationId']
    if (typeof confirmationId === 'string') return confirmationId
  }
  throw new Error('confirmationId is required')
}

function validatePreviewRequest(raw: unknown): ControlledVerificationPreviewRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('preview request must be an object')
  const record = raw as Record<string, unknown>
  if (typeof record['testPath'] !== 'string' || record['testPath'].trim().length === 0) {
    throw new Error('testPath must be a non-empty string')
  }
  return { testPath: record['testPath'], contract: record['contract'] as VerificationContract }
}

/** Builds the allowlisted child environment. Secret-named variables are excluded by construction and by defense. */
export function buildAllowlistedEnv(processEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const systemRoot = processEnv['SystemRoot'] ?? processEnv['WINDIR'] ?? 'C:\\Windows'
  const raw: Record<string, string | undefined> = {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    ComSpec: processEnv['ComSpec'] ?? join(systemRoot, 'System32', 'cmd.exe'),
    TEMP: processEnv['TEMP'] ?? processEnv['TMP'],
    TMP: processEnv['TMP'] ?? processEnv['TEMP'],
    SystemDrive: processEnv['SystemDrive'],
    ProgramFiles: processEnv['ProgramFiles'],
    LOCALAPPDATA: processEnv['LOCALAPPDATA']
  }
  const env: NodeJS.ProcessEnv = {}
  for (const key of ENV_ALLOWLIST_KEYS) {
    const value = raw[key]
    if (value !== undefined && !FORBIDDEN_ENV_PART_RE.test(key)) env[key] = value
  }
  return env
}

function sanitizeOutput(text: string): string {
  return sanitizeForShare(text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')).value
}

export class ControlledVerificationManager {
  private readonly workspaceProvider: () => WorkspaceBinding | null
  private readonly nodeResolver: () => TrustedNodeResult
  private readonly now: () => number
  private readonly confirmationTtlMs: number
  private readonly recipeTimeoutMs: number
  private readonly snapshotService: VerificationSubjectSnapshotService
  private gitInspection: GitVerificationService | null = null
  private pending: PendingConfirmation | null = null
  private activeExecution: ActiveExecution | null = null
  private lastExecuted: ControlledVerificationResult | null = null
  private lastContract: VerificationContract | null = null
  private lastPreview: ControlledVerificationPreview | null = null

  /** The most recent executed verification result, retained for Receipt/Handoff export. */
  getLastExecutedResult(): ControlledVerificationResult | null {
    return this.lastExecuted
  }

  /** The contract bound to the most recent preview/execution, retained for Receipt export. */
  getLastContract(): VerificationContract | null {
    return this.lastContract
  }

  /** The most recent immutable preview, retained for Receipt/Handoff export. */
  getLastPreview(): ControlledVerificationPreview | null {
    return this.lastPreview
  }

  constructor(options: ControlledVerificationManagerOptions = {}) {
    this.workspaceProvider = options.workspaceProvider ?? getSelectedWorkspaceBinding
    this.nodeResolver = options.nodeResolver ?? resolveTrustedNodeExecutable
    this.now = options.now ?? (() => Date.now())
    this.confirmationTtlMs = options.confirmationTtlMs ?? CONTROLLED_VERIFICATION_CONFIRMATION_TTL_MS
    this.recipeTimeoutMs = options.recipeTimeoutMs ?? CONTROLLED_VERIFICATION_DEFAULT_TIMEOUT_MS
    this.snapshotService = options.snapshotService ?? new VerificationSubjectSnapshotService({
      gitExecutable: options.gitExecutable
    })
  }

  isExecuting(): boolean {
    return this.activeExecution !== null
  }

  /** True while a confirmation is pending review. */
  hasPendingConfirmation(): boolean {
    return this.pending !== null
  }

  async createPreview(raw: unknown): Promise<ControlledVerificationPreview> {
    const request = validatePreviewRequest(raw)
    const recipeResult = validateNodeTestRecipe({
      recipeType: 'node-test-v1',
      testPath: request.testPath,
      timeoutMs: this.recipeTimeoutMs,
      expectedWorkspaceMutation: false
    })
    if (!recipeResult.ok) throw new Error(recipeResult.reason)
    const recipe = recipeResult.recipe

    const contract = validateVerificationContract(request.contract)
    this.lastContract = contract

    const node = this.nodeResolver()
    if (!node.trusted) throw new Error(node.reason)

    const workspace = this.workspaceProvider()
    if (!workspace) throw new Error('Select a workspace before generating a verification preview')

    // BLOCKER-1: resolve the test target to a canonical path inside the workspace,
    // rejecting any symlink/junction/reparse component. This runs before the
    // snapshot so the testPath escape is rejected directly and independently of
    // the Subject Snapshot's untracked-file checks. The canonical target and its
    // digest are bound into the preview; the absolute path never crosses IPC.
    const safeTarget = resolveSafeTestTarget(workspace.cwd, recipe.testPath)
    if (!safeTarget.ok) throw new Error(safeTarget.reason)
    const targetDigest = sha256Utf8(canonicalStringify({ target: safeTarget.canonical }))

    const snapshot = await this.snapshotService.capture(workspace.cwd)
    if (!snapshot.complete) {
      throw new Error(`Subject snapshot is incomplete: ${snapshot.exclusion ?? 'unknown'}`)
    }

    const repositoryIdentity = await this.getRepositoryIdentity(workspace.cwd, contract)
    const contractDigest = sha256Utf8(canonicalStringify(contract))
    const policyDigest = digestPolicyDescriptor(POLICY_DESCRIPTOR)

    const confirmationId = randomUUID()
    const createdAt = this.now()
    const expiration = createdAt + this.confirmationTtlMs
    const args = ['--test', recipe.testPath]
    const isolationLevels: ControlledVerificationIsolation[] = [...CONTROLLED_VERIFICATION_ISOLATION_LEVELS]

    const previewWithoutHash: Omit<ControlledVerificationPreview, 'previewHash'> = {
      workspaceDisplayId: workspace.workspaceDisplayId,
      repositoryIdentity,
      contractDigest,
      policyDigest,
      subjectDigest: snapshot.subjectDigest,
      recipeType: 'node-test-v1',
      testPath: recipe.testPath,
      targetDigest,
      nodeIdentityDigest: node.identityDigest,
      args,
      timeoutMs: recipe.timeoutMs,
      environmentProfile: CONTROLLED_VERIFICATION_ENV_PROFILE,
      expiration: new Date(expiration).toISOString(),
      confirmationId,
      commandPreview: `node --test ${recipe.testPath}`,
      isolationLevels
    }
    const preview: ControlledVerificationPreview = {
      ...previewWithoutHash,
      previewHash: sha256Utf8(canonicalStringify(previewWithoutHash))
    }

    this.pending = {
      confirmationId,
      previewHash: preview.previewHash,
      workspaceDisplayId: workspace.workspaceDisplayId,
      cwd: workspace.cwd,
      contractDigest,
      policyDigest,
      subjectDigest: snapshot.subjectDigest,
      recipe,
      canonicalTarget: safeTarget.canonical,
      targetDigest,
      args,
      node,
      expiration,
      used: false
    }
    this.lastPreview = preview

    return preview
  }

  async confirmAndExecute(raw: unknown): Promise<ControlledVerificationResult> {
    const confirmationId = parseConfirmationId(raw)
    const reject = (reason: ControlledVerificationRejectionReason): ControlledVerificationResult => ({
      state: 'rejected',
      confirmationId,
      reason
    })

    const pending = this.pending
    if (!pending || pending.confirmationId !== confirmationId) return reject('CONFIRMATION_NOT_FOUND')

    // MAJOR-1: consume the confirmation synchronously BEFORE the first await, so a
    // concurrent confirm of the same id can never both pass the used-check. Once
    // consumed, the confirmation stays `used` and can never be restored, so later
    // confirms (replays) are rejected as CONFIRMATION_CONSUMED, including after
    // execution failures or cancellation.
    if (pending.used) return reject('CONFIRMATION_CONSUMED')
    if (this.now() > pending.expiration) {
      pending.used = true
      return reject('CONFIRMATION_EXPIRED')
    }
    pending.used = true

    const workspace = this.workspaceProvider()
    if (!workspace || workspace.workspaceDisplayId !== pending.workspaceDisplayId || workspace.cwd !== pending.cwd) {
      return reject('CONFIRMATION_STALE')
    }

    // BLOCKER-1: re-resolve the test target and require its digest to still match
    // the preview-bound target. If the file/junction was swapped after preview,
    // the digest differs and the confirmation is stale (node never launches).
    const safeTarget = resolveSafeTestTarget(workspace.cwd, pending.recipe.testPath)
    if (!safeTarget.ok || sha256Utf8(canonicalStringify({ target: safeTarget.canonical })) !== pending.targetDigest) {
      return reject('CONFIRMATION_STALE')
    }
    pending.canonicalTarget = safeTarget.canonical

    // Fail-closed pre-execution Subject Snapshot: the current code state must
    // still equal the state the user previewed.
    const snapshotBefore = await this.snapshotService.capture(workspace.cwd)
    if (!snapshotBefore.complete) return reject('SUBJECT_SNAPSHOT_INCOMPLETE')
    if (snapshotBefore.subjectDigest !== pending.subjectDigest) return reject('CONFIRMATION_STALE')

    const startedAt = new Date()
    const run = await this.runNodeTest(confirmationId, pending)
    const endedAt = new Date()
    const observedAt = endedAt.toISOString()

    let snapshotAfter: Awaited<ReturnType<VerificationSubjectSnapshotService['capture']>> | null = null
    try {
      snapshotAfter = await this.snapshotService.capture(workspace.cwd)
    } catch {
      snapshotAfter = null
    }
    const subjectStable = Boolean(
      snapshotAfter && snapshotAfter.complete && snapshotAfter.subjectDigest === snapshotBefore.subjectDigest
    )
    const evaluationAsOf = new Date().toISOString()

    let commandStatus: ControlledVerificationCommandStatus
    if (run.cancelled) commandStatus = 'CANCELLED'
    else if (run.timedOut) commandStatus = 'TIMEOUT'
    else if (run.spawnError) commandStatus = 'ERROR'
    else commandStatus = run.exitCode === 0 ? 'PASS' : 'FAIL'

    const evidenceStatus: EvidenceStatus = commandStatus === 'PASS' ? 'PASS' : commandStatus === 'FAIL' ? 'FAIL' : 'UNKNOWN'

    const evidenceItem: EvidenceItem = {
      evidenceId: `ev-${confirmationId}`,
      criterionId: CONTROLLED_VERIFICATION_CRITERION_ID,
      status: evidenceStatus,
      valid: subjectStable,
      policyDigest: pending.policyDigest,
      subjectDigest: snapshotBefore.subjectDigest,
      observedAt
    }
    const fresh = classifyFreshness({
      observedAt,
      evaluationAsOf,
      maxAgeMs: CONTROLLED_VERIFICATION_FRESHNESS_MAX_AGE_MS
    }) === null

    const criterionResult = evaluateCriterion({
      criterionId: CONTROLLED_VERIFICATION_CRITERION_ID,
      enabled: true,
      supported: true,
      policyDigest: pending.policyDigest,
      subjectDigest: snapshotBefore.subjectDigest,
      evaluationAsOf,
      freshnessPolicy: { policyId: 'evidence-freshness-v1', maxAgeMs: CONTROLLED_VERIFICATION_FRESHNESS_MAX_AGE_MS },
      evidence: [evidenceItem]
    })

    // The confirmation stays tracked as `used` so a replay is rejected with
    // CONFIRMATION_CONSUMED (non-replayable). A fresh preview replaces it.

    const executedResult: ControlledVerificationResult = {
      state: 'executed',
      confirmationId,
      commandPreview: pending.commandPreview,
      testPath: pending.recipe.testPath,
      timeoutMs: pending.recipe.timeoutMs,
      isolationLevels: [...CONTROLLED_VERIFICATION_ISOLATION_LEVELS],
      commandStatus,
      exitCode: run.spawnError ? null : run.exitCode,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      observedAt,
      evaluationAsOf,
      stdout: sanitizeOutput(run.stdout),
      stderr: sanitizeOutput(run.stderr),
      stdoutTruncated: run.stdoutTruncated,
      stderrTruncated: run.stderrTruncated,
      subjectBeforeDigest: snapshotBefore.subjectDigest,
      subjectAfterDigest: snapshotAfter?.complete ? snapshotAfter.subjectDigest : '',
      subjectStable,
      subjectChangedDuringVerification: !subjectStable,
      evidence: {
        evidenceId: evidenceItem.evidenceId,
        criterionId: evidenceItem.criterionId,
        status: evidenceStatus,
        valid: subjectStable,
        fresh,
        policyDigest: pending.policyDigest,
        subjectDigest: snapshotBefore.subjectDigest,
        observedAt
      },
      criterion: {
        verdict: criterionResult.verdict,
        policyVersion: criterionResult.policyVersion,
        ruleId: criterionResult.ruleId,
        decisionTrace: criterionResult.decisionTrace
      }
    }
    this.lastExecuted = executedResult
    return executedResult
  }

  cancel(raw: unknown): ControlledVerificationCancelResult {
    const confirmationId = parseConfirmationId(raw)
    const active = this.activeExecution
    if (active && active.confirmationId === confirmationId) {
      active.cancelRequested = true
      this.killProcessTree(active.child)
      return { cancelled: true }
    }
    if (this.pending?.confirmationId === confirmationId) {
      this.pending = null
      return { cancelled: true }
    }
    return { cancelled: false }
  }

  /** Kills the active child process (and its descendants) on app exit. */
  dispose(): void {
    const active = this.activeExecution
    if (active) {
      active.cancelRequested = true
      this.killProcessTree(active.child)
    }
    this.pending = null
  }

  private runNodeTest(confirmationId: string, pending: PendingConfirmation): Promise<CommandRun> {
    return new Promise((resolveRun) => {
      const executable = pending.node.executable
      // BLOCKER-1: execute the re-verified canonical target (absolute path inside
      // the workspace), never the user-supplied relative path, so a junction swap
      // between confirm and spawn cannot redirect node outside the workspace.
      const args = ['--test', pending.canonicalTarget]
      const cwd = pending.cwd
      const env = buildAllowlistedEnv(process.env)
      const timeoutMs = pending.recipe.timeoutMs

      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
      } catch (error) {
        resolveRun({
          exitCode: null,
          stdout: '',
          stderr: `Failed to start node.exe: ${error instanceof Error ? error.message : String(error)}`,
          stdoutTruncated: false,
          stderrTruncated: true,
          timedOut: false,
          cancelled: false,
          spawnError: true
        })
        return
      }

      const execution: ActiveExecution = { confirmationId, child, cancelRequested: false }
      this.activeExecution = execution

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let stdoutTruncated = false
      let stderrTruncated = false
      let timedOut = false
      let settled = false

      const append = (chunks: Buffer[], current: number, chunk: Buffer, limit: number): { current: number; truncated: boolean } => {
        const room = Math.max(0, limit - current)
        if (room) chunks.push(Buffer.from(chunk).subarray(0, room))
        const next = current + Math.min(chunk.length, room)
        return { current: next, truncated: chunk.length > room }
      }

      child.stdout.on('data', (chunk: Buffer) => {
        const result = append(stdoutChunks, stdoutBytes, chunk, OUTPUT_LIMIT_BYTES)
        stdoutBytes = result.current
        stdoutTruncated = stdoutTruncated || result.truncated
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const result = append(stderrChunks, stderrBytes, chunk, OUTPUT_LIMIT_BYTES)
        stderrBytes = result.current
        stderrTruncated = stderrTruncated || result.truncated
      })

      const timer = setTimeout(() => {
        timedOut = true
        this.killProcessTree(child)
      }, timeoutMs)

      child.once('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (this.activeExecution?.confirmationId === confirmationId) this.activeExecution = null
        resolveRun({
          exitCode: null,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: `Failed to start node.exe: ${error.message}`,
          stdoutTruncated,
          stderrTruncated: true,
          timedOut: false,
          cancelled: false,
          spawnError: true
        })
      })

      child.once('exit', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (this.activeExecution?.confirmationId === confirmationId) this.activeExecution = null
        resolveRun({
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          stdoutTruncated,
          stderrTruncated,
          timedOut,
          cancelled: execution.cancelRequested,
          spawnError: false
        })
      })
    })
  }

  private async getRepositoryIdentity(
    cwd: string,
    contract: VerificationContract
  ): Promise<ControlledVerificationPreview['repositoryIdentity']> {
    this.gitInspection ??= new GitVerificationService()
    const inspection = await this.gitInspection.inspect(cwd, contract)
    return inspection.repository
  }

  private killProcessTree(child: ChildProcessWithoutNullStreams): void {
    const pid = child.pid
    if (pid === undefined) {
      try { child.kill() } catch { /* ignore */ }
      return
    }
    if (process.platform === 'win32') {
      const systemRoot = process.env['SystemRoot'] ?? process.env['WINDIR'] ?? 'C:\\Windows'
      const taskkill = join(systemRoot, 'System32', 'taskkill.exe')
      try {
        spawn(taskkill, ['/pid', String(pid), '/T', '/F'], {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
          env: { SystemRoot: systemRoot, WINDIR: systemRoot }
        })
      } catch {
        try { child.kill() } catch { /* ignore */ }
      }
    } else {
      try { child.kill('SIGTERM') } catch { /* ignore */ }
    }
  }
}
