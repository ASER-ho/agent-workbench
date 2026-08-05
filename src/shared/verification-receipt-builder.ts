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

/**
 * Build a Verification Receipt.
 *
 * The `receiptDigest` field is excluded from its own digest computation
 * (non-self-referential). Arrays (evidence, criterionResults, unresolvedItems)
 * are sorted stably by a fixed key so input order never affects the digest.
 * The digest is SHA-256 of the domain-prefixed canonical JSON.
 */
export function buildVerificationReceipt(input: VerificationReceiptInput): VerificationReceipt {
  const evidence = stableSort(input.evidence, e => e.evidenceId)
  const criterionResults = stableSort(input.criterionResults, c => c.criterionId)
  const unresolvedItems = input.unresolvedItems.slice().sort()

  const digestPayload = {
    schemaVersion: VERIFICATION_RECEIPT_SCHEMA,
    contract: input.contract,
    workspace: input.workspace,
    subject: input.subject,
    policy: input.policy,
    verification: input.verification,
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
    contract: input.contract,
    workspace: input.workspace,
    subject: input.subject,
    policy: input.policy,
    verification: input.verification,
    evidence,
    criterionResults,
    overallVerdict: input.overallVerdict,
    unresolvedItems,
    acceptanceDecision: input.acceptanceDecision
  }
}
