// Verification Receipt data model.
// Pure TypeScript: no Node, fs, network, Electron, Agent, or LLM access.
//
// Security invariants:
// - The Receipt must never contain API keys, tokens, cookies, passwords, the
//   full environment, absolute workspace paths, absolute node.exe paths, raw
//   stdout/stderr, or any renderer-supplied executable parameters.
// - acceptanceDecision is fixed to NOT_RECORDED. VERIFIED is a verification
//   verdict, never an acceptance/publish/release decision.
import type { CriterionVerdict, EvidenceStatus } from './evaluation-types.ts'

export const VERIFICATION_RECEIPT_SCHEMA = 'aw-verification-receipt-v1' as const
export const VERIFICATION_RECEIPT_DIGEST_PREFIX = 'aw-verification-receipt-v1\0'

export type AcceptanceDecision = 'NOT_RECORDED'

export interface ReceiptContract {
  contractId: string
  contractDigest: string
  criteria: Array<{ criterionId: string; title: string }>
}

export interface ReceiptWorkspace {
  displayId: string
  repositoryIdentityDigest: string
}

export interface ReceiptSubject {
  subjectDigest: string
  headOid: string | null
  complete: boolean
}

export interface ReceiptPolicy {
  policyVersion: string
  policyDigest: string
  freshnessPolicyId: string
}

export interface ReceiptVerification {
  recipeType: string
  displaySafeCommand: string
  executionStatus: string
  exitCode: number | null
  isolationLevel: string
  outputTruncated: boolean
}

export interface ReceiptEvidence {
  evidenceId: string
  criterionId: string
  result: EvidenceStatus
  valid: boolean
  policyDigest: string
  subjectDigest: string
  observedAt: string
  exclusionReason: string | null
}

export interface ReceiptCriterionResult {
  criterionId: string
  verdict: CriterionVerdict
  ruleId: string
  decisionTrace: string[]
}

export interface VerificationReceipt {
  schemaVersion: typeof VERIFICATION_RECEIPT_SCHEMA
  receiptDigest: string
  contract: ReceiptContract
  workspace: ReceiptWorkspace
  subject: ReceiptSubject
  policy: ReceiptPolicy
  verification: ReceiptVerification
  evidence: ReceiptEvidence[]
  criterionResults: ReceiptCriterionResult[]
  overallVerdict: CriterionVerdict
  unresolvedItems: string[]
  acceptanceDecision: AcceptanceDecision
}

/** Builder input: the structured, already-safe values from which the Receipt is derived. */
export interface VerificationReceiptInput {
  contract: ReceiptContract
  workspace: ReceiptWorkspace
  subject: ReceiptSubject
  policy: ReceiptPolicy
  verification: ReceiptVerification
  evidence: ReceiptEvidence[]
  criterionResults: ReceiptCriterionResult[]
  overallVerdict: CriterionVerdict
  unresolvedItems: string[]
  acceptanceDecision: AcceptanceDecision
}
