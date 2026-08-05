// Deterministic Verification Receipt builder.
// Pure TypeScript: no time, random, fs, network, Electron, Agent, or LLM access.
// The builder must never read the current time — all timestamps come from the
// explicitly provided input. Identical input produces identical output.
import { createHash } from 'node:crypto'

import {
  VERIFICATION_RECEIPT_DIGEST_PREFIX,
  VERIFICATION_RECEIPT_SCHEMA,
  type VerificationReceipt,
  type VerificationReceiptInput
} from './verification-receipt-types.ts'
import { sanitizeHandoffText } from './display-sanitize.ts'

/** Canonical JSON serialization with recursively sorted object keys. */
export function canonicalReceiptStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalReceiptStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalReceiptStringify(record[key])}`).join(',')}}`
}

function stableSort<T>(items: readonly T[], key: (item: T) => string): T[] {
  return items.slice().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

/** Throws a stable error on duplicate ids; never auto-selects one duplicate. */
function assertUnique(ids: readonly string[], label: string, errorCode: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`${errorCode}: ${label} contains duplicate id`)
    seen.add(id)
  }
}

/**
 * Build a Verification Receipt.
 *
 * Fail-closed: duplicate criterionResult/evidence/contract criterion ids are
 * rejected with a stable error BEFORE sorting or digesting, so a duplicate never
 * silently collapses and never depends on input order.
 *
 * The `receiptDigest` field is excluded from its own digest computation
 * (non-self-referential). Arrays (evidence, criterionResults, unresolvedItems)
 * are sorted stably by a fixed key so input order never affects the digest.
 * The digest is SHA-256 of the domain-prefixed canonical JSON.
 */
export function buildVerificationReceipt(input: VerificationReceiptInput): VerificationReceipt {
  assertUnique(input.criterionResults.map(c => c.criterionId), 'criterionResults', 'DUPLICATE_CRITERION_ID')
  assertUnique(input.evidence.map(e => e.evidenceId), 'evidence', 'DUPLICATE_EVIDENCE_ID')
  assertUnique(input.contract.criteria.map(c => c.criterionId), 'contract criteria', 'DUPLICATE_CRITERION_ID')

  // JSON Receipt: user-controlled text fields must at least be display-safe
  // redacted (secrets/paths removed). Markdown escaping is NOT applied here so
  // machine fields stay valid JSON strings.
  const contract = {
    ...input.contract,
    contractId: sanitizeHandoffText(input.contract.contractId),
    criteria: input.contract.criteria.map(c => ({ criterionId: sanitizeHandoffText(c.criterionId), title: sanitizeHandoffText(c.title) }))
  }
  const workspace = {
    displayId: sanitizeHandoffText(input.workspace.displayId),
    repositoryIdentityDigest: sanitizeHandoffText(input.workspace.repositoryIdentityDigest)
  }
  const verification = {
    ...input.verification,
    recipeType: sanitizeHandoffText(input.verification.recipeType),
    displaySafeCommand: sanitizeHandoffText(input.verification.displaySafeCommand),
    executionStatus: sanitizeHandoffText(input.verification.executionStatus),
    isolationLevel: sanitizeHandoffText(input.verification.isolationLevel)
  }
  const policy = {
    ...input.policy,
    policyVersion: sanitizeHandoffText(input.policy.policyVersion),
    policyDigest: sanitizeHandoffText(input.policy.policyDigest),
    freshnessPolicyId: sanitizeHandoffText(input.policy.freshnessPolicyId)
  }
  const evidence = stableSort(input.evidence, e => e.evidenceId).map(e => ({
    ...e,
    criterionId: sanitizeHandoffText(e.criterionId),
    policyDigest: sanitizeHandoffText(e.policyDigest),
    subjectDigest: sanitizeHandoffText(e.subjectDigest),
    observedAt: sanitizeHandoffText(e.observedAt),
    exclusionReason: e.exclusionReason === null ? null : sanitizeHandoffText(e.exclusionReason)
  }))
  const criterionResults = stableSort(input.criterionResults, c => c.criterionId).map(c => ({
    ...c,
    criterionId: sanitizeHandoffText(c.criterionId),
    ruleId: sanitizeHandoffText(c.ruleId),
    decisionTrace: c.decisionTrace.map(line => sanitizeHandoffText(line))
  }))
  const unresolvedItems = input.unresolvedItems.slice().sort().map(item => sanitizeHandoffText(item))

  const digestPayload = {
    schemaVersion: VERIFICATION_RECEIPT_SCHEMA,
    contract,
    workspace,
    subject: input.subject,
    policy,
    verification,
    evidence,
    criterionResults,
    overallVerdict: input.overallVerdict,
    unresolvedItems,
    acceptanceDecision: input.acceptanceDecision
  }

  const receiptDigest = createHash('sha256')
    .update(VERIFICATION_RECEIPT_DIGEST_PREFIX + canonicalReceiptStringify(digestPayload), 'utf8')
    .digest('hex')

  return {
    schemaVersion: VERIFICATION_RECEIPT_SCHEMA,
    receiptDigest,
    contract,
    workspace,
    subject: input.subject,
    policy,
    verification,
    evidence,
    criterionResults,
    overallVerdict: input.overallVerdict,
    unresolvedItems,
    acceptanceDecision: input.acceptanceDecision
  }
}
