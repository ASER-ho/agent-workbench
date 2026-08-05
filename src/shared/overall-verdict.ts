// Deterministic overall-verdict aggregation for a set of criterion results.
// Pure TypeScript: no time, random, fs, network, Electron, Agent, or LLM access.
// Fixed rule order (frozen) — identical input produces identical output.
import type { CriterionVerdict } from './evaluation-types.ts'

export interface CriterionResultForAggregation {
  criterionId: string
  verdict: CriterionVerdict
}

export interface OverallVerdictResult {
  verdict: CriterionVerdict
  ruleId: string
  decisionTrace: string[]
}

export const OVERALL_VERDICT_RULES = {
  NO_CRITERIA: 'OVR_V1_NO_CRITERIA',
  ANY_FAILED: 'OVR_V1_ANY_FAILED',
  ANY_INSUFFICIENT: 'OVR_V1_ANY_INSUFFICIENT',
  ANY_NOT_EVALUATED: 'OVR_V1_ANY_NOT_EVALUATED',
  ALL_VERIFIED: 'OVR_V1_ALL_VERIFIED'
} as const

/**
 * Aggregate overall verdict with a frozen priority order:
 * 1. no criteria          -> NOT_EVALUATED
 * 2. any FAILED           -> FAILED
 * 3. no FAILED, any INSUFFICIENT_EVIDENCE -> INSUFFICIENT_EVIDENCE
 * 4. no above, any NOT_EVALUATED -> NOT_EVALUATED
 * 5. all VERIFIED         -> VERIFIED
 *
 * Criteria are sorted by criterionId for a stable decisionTrace.
 */
export function aggregateOverallVerdict(
  criteria: readonly CriterionResultForAggregation[]
): OverallVerdictResult {
  const sorted = criteria
    .slice()
    .sort((a, b) => (a.criterionId < b.criterionId ? -1 : a.criterionId > b.criterionId ? 1 : 0))

  if (sorted.length === 0) {
    return {
      verdict: 'NOT_EVALUATED',
      ruleId: OVERALL_VERDICT_RULES.NO_CRITERIA,
      decisionTrace: ['rule:OVR_V1_NO_CRITERIA', 'criteria:', 'verdict:NOT_EVALUATED']
    }
  }
  const hasFailed = sorted.some(c => c.verdict === 'FAILED')
  const hasInsufficient = sorted.some(c => c.verdict === 'INSUFFICIENT_EVIDENCE')
  const hasNotEvaluated = sorted.some(c => c.verdict === 'NOT_EVALUATED')
  const allVerified = sorted.every(c => c.verdict === 'VERIFIED')

  let verdict: CriterionVerdict
  let ruleId: string
  if (hasFailed) {
    verdict = 'FAILED'
    ruleId = OVERALL_VERDICT_RULES.ANY_FAILED
  } else if (hasInsufficient) {
    verdict = 'INSUFFICIENT_EVIDENCE'
    ruleId = OVERALL_VERDICT_RULES.ANY_INSUFFICIENT
  } else if (hasNotEvaluated) {
    verdict = 'NOT_EVALUATED'
    ruleId = OVERALL_VERDICT_RULES.ANY_NOT_EVALUATED
  } else if (allVerified) {
    verdict = 'VERIFIED'
    ruleId = OVERALL_VERDICT_RULES.ALL_VERIFIED
  } else {
    // Should be unreachable given the four verdict values, but fail closed.
    verdict = 'INSUFFICIENT_EVIDENCE'
    ruleId = OVERALL_VERDICT_RULES.ANY_INSUFFICIENT
  }

  const criterionIds = sorted.map(c => c.criterionId).join(',')
  return {
    verdict,
    ruleId,
    decisionTrace: [
      `criteria:${criterionIds}`,
      `rule:${ruleId}`,
      `verdict:${verdict}`
    ]
  }
}
