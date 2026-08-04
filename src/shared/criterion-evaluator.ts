// Deterministic single-criterion evaluator.
// Pure function: identical valid input produces identical output.
// No time, random, network, fs, Electron, Agent, or LLM access.
import type { CriterionEvaluationResult, EvidenceItem, EvaluationRequest } from './evaluation-types.ts'
import { EVALUATION_POLICY_VERSION, evaluateByPolicyV1 } from './evaluation-policy-v1.ts'

/**
 * Normalize evidence deterministically:
 * - keep only valid=true items;
 * - keep only items whose criterionId matches the target criterion;
 * - keep only items whose policyDigest and subjectDigest match the request
 *   (when the request declares digests; evidence missing a declared digest is excluded);
 * - sort by evidenceId (string compare) so input array order never affects output.
 * Returns the retained items; the count of excluded items is reported separately.
 */
export function normalizeEvidence(
  criterionId: string,
  evidence: EvidenceItem[],
  digests: { policyDigest?: string; subjectDigest?: string }
): { retained: EvidenceItem[]; excluded: number } {
  const retained = evidence
    .filter(item =>
      item.valid === true &&
      item.criterionId === criterionId &&
      (digests.policyDigest === undefined || item.policyDigest === digests.policyDigest) &&
      (digests.subjectDigest === undefined || item.subjectDigest === digests.subjectDigest)
    )
    .slice()
    .sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0))
  return { retained, excluded: evidence.length - retained.length }
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

export function evaluateCriterion(request: EvaluationRequest): CriterionEvaluationResult {
  const { retained, excluded } = normalizeEvidence(request.criterionId, request.evidence, {
    policyDigest: request.policyDigest,
    subjectDigest: request.subjectDigest
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
