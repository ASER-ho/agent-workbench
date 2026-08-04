// Deterministic SHA-256 digests for policies and subjects.
// Lives in src/main (Node environment): uses node:crypto, so it must NOT be imported
// by any module bundled into the Electron renderer. Deterministic: fixed field order,
// fixed UTF-8 encoding, SHA-256, no time/random/local-path/process info.
import { createHash } from 'node:crypto'

import type { PolicyDescriptor, SubjectSnapshot } from '../../shared/evaluation-types.ts'

/**
 * Stable, canonical JSON serialization: object keys are sorted recursively,
 * so field insertion order never affects the digest. Primitive values are
 * encoded exactly; no whitespace.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')}}`
}

/** SHA-256 of the UTF-8 bytes of `text`, hex-encoded. */
export function sha256Utf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Digest of a PolicyDescriptor's content fields (policyVersion + evaluatorRuleSet).
 * The policyDigest field itself is excluded to avoid self-reference.
 */
export function digestPolicyDescriptor(policy: PolicyDescriptor): string {
  const content = { policyVersion: policy.policyVersion, evaluatorRuleSet: policy.evaluatorRuleSet }
  return sha256Utf8(canonicalStringify(content))
}

/**
 * Digest of a SubjectSnapshot's content field (subjectId).
 * The subjectDigest field itself is excluded to avoid self-reference.
 */
export function digestSubjectSnapshot(subject: SubjectSnapshot): string {
  const content = { subjectId: subject.subjectId }
  return sha256Utf8(canonicalStringify(content))
}
