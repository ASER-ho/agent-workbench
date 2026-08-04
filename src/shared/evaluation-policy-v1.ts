// Frozen evaluation policy r2b1-v1.
// Rule order and IDs are frozen. Changing this policy changes the evaluation semantics,
// so this file must be treated as a contract, not casually edited.
import type { EvidenceStatus, CriterionVerdict } from './evaluation-types.ts'

export const EVALUATION_POLICY_VERSION = 'r2b1-v1'

export const EVAL_RULES = {
  DISABLED: 'EVAL_V1_DISABLED',
  UNSUPPORTED: 'EVAL_V1_UNSUPPORTED',
  ANY_FAIL: 'EVAL_V1_ANY_FAIL',
  PASS_WITHOUT_FAIL: 'EVAL_V1_PASS_WITHOUT_FAIL',
  NO_VALID_EVIDENCE: 'EVAL_V1_NO_VALID_EVIDENCE'
} as const

export type EvalRuleId = (typeof EVAL_RULES)[keyof typeof EVAL_RULES]

export interface PolicyEvaluation {
  verdict: CriterionVerdict
  ruleId: EvalRuleId
  passCount: number
  failCount: number
  unknownCount: number
}

/**
 * Apply the frozen rule order:
 * 1. enabled=false              → NOT_EVALUATED
 * 2. supported=false            → NOT_EVALUATED
 * 3. any FAIL                   → FAILED
 * 4. no FAIL, at least one PASS → VERIFIED
 * 5. otherwise                  → INSUFFICIENT_EVIDENCE
 */
export function evaluateByPolicyV1(params: {
  enabled: boolean
  supported: boolean
  statuses: EvidenceStatus[]
}): PolicyEvaluation {
  if (!params.enabled) {
    return { verdict: 'NOT_EVALUATED', ruleId: EVAL_RULES.DISABLED, passCount: 0, failCount: 0, unknownCount: 0 }
  }
  if (!params.supported) {
    return { verdict: 'NOT_EVALUATED', ruleId: EVAL_RULES.UNSUPPORTED, passCount: 0, failCount: 0, unknownCount: 0 }
  }
  const passCount = params.statuses.filter(s => s === 'PASS').length
  const failCount = params.statuses.filter(s => s === 'FAIL').length
  const unknownCount = params.statuses.filter(s => s === 'UNKNOWN').length
  if (failCount > 0) {
    return { verdict: 'FAILED', ruleId: EVAL_RULES.ANY_FAIL, passCount, failCount, unknownCount }
  }
  if (passCount > 0) {
    return { verdict: 'VERIFIED', ruleId: EVAL_RULES.PASS_WITHOUT_FAIL, passCount, failCount, unknownCount }
  }
  return { verdict: 'INSUFFICIENT_EVIDENCE', ruleId: EVAL_RULES.NO_VALID_EVIDENCE, passCount, failCount, unknownCount }
}
