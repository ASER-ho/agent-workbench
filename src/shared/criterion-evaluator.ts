// Deterministic single-criterion evaluator.
// Pure function: identical valid input produces identical output.
// No time, random, network, fs, Electron, Agent, or LLM access.
import type { CriterionEvaluationResult, EvidenceItem, EvaluationRequest } from './evaluation-types.ts'
import { EVALUATION_POLICY_VERSION, evaluateByPolicyV1 } from './evaluation-policy-v1.ts'

/**
 * Normalize evidence deterministically with fail-closed digest binding.
 * Binding is mandatory: the request MUST declare both policyDigest and subjectDigest.
 * - keep only valid=true items;
 * - keep only items whose criterionId matches the target criterion;
 * - keep only items that carry a policyDigest AND subjectDigest, both strictly
 *   equal to the request's digests (undefined never matches a declared digest).
 * - sort by evidenceId (string compare) so input array order never affects output.
 * Returns the retained items; the count of excluded items is reported separately.
 */
export function normalizeEvidence(
  criterionId: string,
  evidence: EvidenceItem[],
  digests: { policyDigest: string; subjectDigest: string }
): { retained: EvidenceItem[]; excluded: number } {
  const retained = evidence
    .filter(item =>
      item.valid === true &&
      item.criterionId === criterionId &&
      item.policyDigest !== undefined &&
      item.policyDigest === digests.policyDigest &&
      item.subjectDigest !== undefined &&
      item.subjectDigest === digests.subjectDigest
    )
    .slice()
    .sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0))
  return { retained, excluded: evidence.length - retained.length }
}

/**
 * True when the request declares both digests required to establish a binding.
 */
export function hasCompleteBinding(request: EvaluationRequest): boolean {
  return request.policyDigest !== undefined && request.subjectDigest !== undefined
}

/**
 * Build a fixed-format decisionTrace as an ordered list of lines. Order of lines
 * is fixed; content is derived only from the normalized evidence and the matched
 * rule. No timestamps, addresses, or environment paths.
 */
export function buildDecisionTrace(params: {
  criterionId: string
  ruleId: string
  verdict: string
  passCount: number
  failCount: number
  unknownCount: number
  excluded: number
}): string[] {
  return [
    `policy:${EVALUATION_POLICY_VERSION}`,
    `criterion:${params.criterionId}`,
    `valid-evidence:pass=${params.passCount},fail=${params.failCount},unknown=${params.unknownCount}`,
    `excluded:${params.excluded}`,
    `rule:${params.ruleId}`,
    `verdict:${params.verdict}`
  ]
}

function notEvaluatedResult(request: EvaluationRequest, ruleId: string): CriterionEvaluationResult {
  return {
    criterionId: request.criterionId,
    verdict: 'NOT_EVALUATED',
    policyVersion: 'r2b1-v1',
    ruleId,
    decisionTrace: buildDecisionTrace({
      criterionId: request.criterionId,
      ruleId,
      verdict: 'NOT_EVALUATED',
      passCount: 0,
      failCount: 0,
      unknownCount: 0,
      excluded: 0
    })
  }
}

export function evaluateCriterion(request: EvaluationRequest): CriterionEvaluationResult {
  // Rule order: disabled/unsupported first (frozen policy), then fail-closed binding.
  if (!request.enabled) {
    return notEvaluatedResult(request, 'EVAL_V1_DISABLED')
  }
  if (!request.supported) {
    return notEvaluatedResult(request, 'EVAL_V1_UNSUPPORTED')
  }
  if (!hasCompleteBinding(request)) {
    // Fail-closed: without both digests the binding cannot be established, so no
    // evidence can participate and no PASS/FAIL verdict may be produced.
    return {
      criterionId: request.criterionId,
      verdict: 'INSUFFICIENT_EVIDENCE',
      policyVersion: 'r2b1-v1',
      ruleId: 'EVAL_V1_NO_VALID_EVIDENCE',
      decisionTrace: buildDecisionTrace({
        criterionId: request.criterionId,
        ruleId: 'EVAL_V1_NO_VALID_EVIDENCE',
        verdict: 'INSUFFICIENT_EVIDENCE',
        passCount: 0,
        failCount: 0,
        unknownCount: 0,
        excluded: request.evidence.length
      })
    }
  }
  const { retained, excluded } = normalizeEvidence(request.criterionId, request.evidence, {
    policyDigest: request.policyDigest as string,
    subjectDigest: request.subjectDigest as string
  })
  const statuses = retained.map(item => item.status)
  const policyResult = evaluateByPolicyV1({
    enabled: request.enabled,
    supported: request.supported,
    statuses
  })
  const decisionTrace = buildDecisionTrace({
    criterionId: request.criterionId,
    ruleId: policyResult.ruleId,
    verdict: policyResult.verdict,
    passCount: policyResult.passCount,
    failCount: policyResult.failCount,
    unknownCount: policyResult.unknownCount,
    excluded
  })
  return {
    criterionId: request.criterionId,
    verdict: policyResult.verdict,
    policyVersion: 'r2b1-v1',
    ruleId: policyResult.ruleId,
    decisionTrace
  }
}
