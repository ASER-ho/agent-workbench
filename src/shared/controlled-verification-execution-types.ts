// Controlled verification execution types: preview, confirmation, and result.
// Pure TypeScript module: no Node, fs, network, Electron, Agent, or LLM access.
// Shared between the main process (manager + IPC) and the renderer.
//
// Security invariants enforced by the manager (not the renderer):
// - The renderer may only submit `confirmationId` at confirm time. It can never
//   supply executable/cwd/env/args/PID/subject-digest/policy-digest.
// - A preview binds a fixed command, a captured Subject Snapshot, a fixed policy
//   digest, a trusted node.exe identity, and a 5-minute expiration.
// - A confirmation is single-use, non-replayable, bound to the current workspace,
//   and invalidated immediately when the Contract or the code changes.
import type { CriterionVerdict, EvidenceStatus } from './evaluation-types.ts'
import type { VerificationContract } from './verification-types.ts'

/** Default confirmation lifetime: 5 minutes. */
export const CONTROLLED_VERIFICATION_CONFIRMATION_TTL_MS = 5 * 60 * 1000

/** Default test run timeout: 30 seconds. The renderer cannot change this. */
export const CONTROLLED_VERIFICATION_DEFAULT_TIMEOUT_MS = 30_000

/** Evidence freshness window: 5 minutes. The renderer cannot change this. */
export const CONTROLLED_VERIFICATION_FRESHNESS_MAX_AGE_MS = 5 * 60 * 1000

/** Fixed environment profile describing the allowlist used when spawning. */
export const CONTROLLED_VERIFICATION_ENV_PROFILE = 'allowlist-v1'

/** Fixed criterion id used for the functional verification evaluation. */
export const CONTROLLED_VERIFICATION_CRITERION_ID = 'C-FUNCTIONAL-VERIFIED'

/**
 * Truthful isolation report for the spawned test process. No OS-level sandbox is
 * used; these constants describe what is actually enforced so the UI never
 * claims a generic "sandboxed execution".
 */
export type ControlledVerificationIsolation =
  | 'PROCESS_BOUNDARY_ONLY'
  | 'NO_FILESYSTEM_SANDBOX'
  | 'NETWORK_NOT_ENFORCED'
  | 'ALLOWLISTED_ENVIRONMENT'
  | 'WORKSPACE_FIXED_CWD'

export const CONTROLLED_VERIFICATION_ISOLATION_LEVELS: ControlledVerificationIsolation[] = [
  'PROCESS_BOUNDARY_ONLY',
  'NO_FILESYSTEM_SANDBOX',
  'NETWORK_NOT_ENFORCED',
  'ALLOWLISTED_ENVIRONMENT',
  'WORKSPACE_FIXED_CWD'
]

export interface ControlledVerificationRepositoryIdentity {
  displayName: string
  displayId: string
  branch: string
  head: string
}

/** Renderer → main preview request. The renderer supplies only testPath + contract. */
export interface ControlledVerificationPreviewRequest {
  testPath: string
  contract: VerificationContract
}

/** Immutable preview the user must review before one-time confirmation. */
export interface ControlledVerificationPreview {
  workspaceDisplayId: string
  repositoryIdentity: ControlledVerificationRepositoryIdentity
  contractDigest: string
  policyDigest: string
  subjectDigest: string
  recipeType: 'node-test-v1'
  testPath: string
  /** Digest of the canonical resolved target inside the workspace (display-safe; never the absolute path). */
  targetDigest: string
  nodeIdentityDigest: string
  args: string[]
  timeoutMs: number
  environmentProfile: string
  expiration: string
  confirmationId: string
  previewHash: string
  commandPreview: string
  isolationLevels: ControlledVerificationIsolation[]
}

export type ControlledVerificationCommandStatus = 'PASS' | 'FAIL' | 'TIMEOUT' | 'CANCELLED' | 'ERROR'

export type ControlledVerificationRejectionReason =
  | 'CONFIRMATION_NOT_FOUND'
  | 'CONFIRMATION_CONSUMED'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_STALE'
  | 'SUBJECT_SNAPSHOT_INCOMPLETE'

/** Evidence recorded by the main process and bound to the Subject Snapshot. */
export interface ControlledVerificationEvidence {
  evidenceId: string
  criterionId: string
  status: EvidenceStatus
  valid: boolean
  fresh: boolean
  policyDigest: string
  subjectDigest: string
  observedAt: string
}

export interface ControlledVerificationCriterion {
  verdict: CriterionVerdict
  policyVersion: 'r2b1-v1'
  ruleId: string
  decisionTrace: string[]
}

export type ControlledVerificationResult =
  | {
      state: 'rejected'
      confirmationId: string
      reason: ControlledVerificationRejectionReason
    }
  | {
      state: 'executed'
      confirmationId: string
      commandPreview: string
      testPath: string
      timeoutMs: number
      isolationLevels: ControlledVerificationIsolation[]
      commandStatus: ControlledVerificationCommandStatus
      exitCode: number | null
      startedAt: string
      endedAt: string
      observedAt: string
      evaluationAsOf: string
      stdout: string
      stderr: string
      stdoutTruncated: boolean
      stderrTruncated: boolean
      subjectBeforeDigest: string
      subjectAfterDigest: string
      subjectStable: boolean
      /** True when the Subject Snapshot changed while the command was running. */
      subjectChangedDuringVerification: boolean
      evidence: ControlledVerificationEvidence | null
      criterion: ControlledVerificationCriterion
    }

export interface ControlledVerificationCancelResult {
  cancelled: boolean
}
