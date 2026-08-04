// Evidence freshness policy r2b1-v1 helpers.
// Pure functions only: no current time, random, network, fs, Electron, Agent, or
// LLM access. They consume only the explicitly provided inputs, so identical
// valid input produces identical output.
import type { EvidenceFreshnessPolicy } from './evaluation-types.ts'

export type EvidenceFreshnessExclusion =
  | 'INVALID_FRESHNESS_METADATA' // missing/malformed observedAt (or unusable evaluation time)
  | 'FUTURE_EVIDENCE' // observedAt later than evaluationAsOf
  | 'STALE_EVIDENCE' // evaluationAsOf - observedAt > maxAgeMs

export const EVIDENCE_FRESHNESS_POLICY_ID = 'evidence-freshness-v1'

export const FRESHNESS_RULES = {
  NO_EVALUATION_TIME: 'EVAL_V1_NO_EVALUATION_TIME',
  NO_FRESHNESS_POLICY: 'EVAL_V1_NO_FRESHNESS_POLICY'
} as const

/**
 * True when value is a string that Date.parse can interpret as a real instant and
 * that round-trips: serializing the parsed instant back to canonical ISO 8601 and
 * re-parsing yields the identical instant. Does not read the current time.
 */
export function isValidIsoTimestamp(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    return false
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return false
  }
  // Round-trip guard: reject strings Date.parse coerces but that are not stable
  // ISO 8601 timestamps (empty, garbage, bare years, non-ISO separators, etc.).
  return Date.parse(new Date(parsed).toISOString()) === parsed
}

/**
 * True when value is a usable EvidenceFreshnessPolicy: the exact policy id and a
 * finite, non-negative maxAgeMs. A missing or malformed policy must never let a
 * criterion evaluate, so callers treat `false` as fail-closed.
 */
export function isEvidenceFreshnessPolicy(value: unknown): value is EvidenceFreshnessPolicy {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const policy = value as Partial<EvidenceFreshnessPolicy>
  return (
    policy.policyId === EVIDENCE_FRESHNESS_POLICY_ID &&
    typeof policy.maxAgeMs === 'number' &&
    Number.isFinite(policy.maxAgeMs) &&
    policy.maxAgeMs >= 0
  )
}

/**
 * Classify a single evidence item's freshness relative to the evaluation time.
 * Returns an EvidenceFreshnessExclusion when the evidence must be excluded, or
 * null when the evidence is fresh enough to participate.
 *
 * evaluationAsOf is expected to be validated by the caller (the evaluator fails
 * closed on a missing/malformed evaluation time before reaching this helper). If
 * it is nevertheless unusable, the evidence's metadata cannot be judged and is
 * treated as INVALID_FRESHNESS_METADATA (fail-closed).
 */
export function classifyFreshness(params: {
  observedAt?: string
  evaluationAsOf?: string
  maxAgeMs: number
}): EvidenceFreshnessExclusion | null {
  const { observedAt, evaluationAsOf, maxAgeMs } = params
  if (observedAt === undefined || !isValidIsoTimestamp(observedAt)) {
    return 'INVALID_FRESHNESS_METADATA'
  }
  if (evaluationAsOf === undefined || !isValidIsoTimestamp(evaluationAsOf)) {
    return 'INVALID_FRESHNESS_METADATA'
  }
  const observedMs = Date.parse(observedAt)
  const asOfMs = Date.parse(evaluationAsOf)
  if (observedMs > asOfMs) {
    return 'FUTURE_EVIDENCE'
  }
  if (asOfMs - observedMs > maxAgeMs) {
    return 'STALE_EVIDENCE'
  }
  return null
}
