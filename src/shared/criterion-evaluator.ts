// Deterministic single-criterion evaluator.
// Pure function: identical valid input produces identical output.
// No time, random, network, fs, Electron, Agent, or LLM access.
import type { CriterionEvaluationResult, EvidenceItem, EvaluationRequest } from './evaluation-types.ts'
import { EVALUATION_POLICY_VERSION, evaluateByPolicyV1 } from './evaluation-policy-v1.ts'
import { classifyFreshness, FRESHNESS_RULES, isEvidenceFreshnessPolicy, isValidIsoTimestamp } from './evidence-freshness-policy-v1.ts'

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
  freshnessExclusions?: { invalid: number; future: number; stale: number }
}): string[] {
  const f = params.freshnessExclusions ?? { invalid: 0, future: 0, stale: 0 }
  return [
    `policy:${EVALUATION_POLICY_VERSION}`,
    `criterion:${params.criterionId}`,
    `valid-evidence:pass=${params.passCount},fail=${params.failCount},unknown=${params.unknownCount}`,
    `excluded:${params.excluded}`,
    `freshness-excluded:invalid=${f.invalid},future=${f.future},stale=${f.stale}`,
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

function insufficientResult(request: EvaluationRequest, ruleId: string, excluded: number): CriterionEvaluationResult {
  return {
    criterionId: request.criterionId,
    verdict: 'INSUFFICIENT_EVIDENCE',
    policyVersion: 'r2b1-v1',
    ruleId,
    decisionTrace: buildDecisionTrace({
      criterionId: request.criterionId,
      ruleId,
      verdict: 'INSUFFICIENT_EVIDENCE',
      passCount: 0,
      failCount: 0,
      unknownCount: 0,
      excluded
    })
  }
}

/**
 * Apply the evidence freshness policy to the digest-matched candidates. Evidence
 * whose freshness metadata is unusable, that is observed after the evaluation
 * time, or that is older than maxAgeMs is excluded. The retained items and the
 * per-reason exclusion counts are returned; the evaluator never reads the current
 * time and only consumes the explicit evaluationAsOf.
 */
function filterByFreshness(
  evidence: EvidenceItem[],
  evaluationAsOf: string,
  maxAgeMs: number
): { fresh: EvidenceItem[]; excluded: { invalid: number; future: number; stale: number } } {
  const excluded = { invalid: 0, future: 0, stale: 0 }
  const fresh: EvidenceItem[] = []
  for (const item of evidence) {
    const reason = classifyFreshness({ observedAt: item.observedAt, evaluationAsOf, maxAgeMs })
    if (reason === null) {
      fresh.push(item)
    } else if (reason === 'INVALID_FRESHNESS_METADATA') {
      excluded.invalid += 1
    } else if (reason === 'FUTURE_EVIDENCE') {
      excluded.future += 1
    } else {
      excluded.stale += 1
    }
  }
  return { fresh, excluded }
}

export function evaluateCriterion(request: EvaluationRequest): CriterionEvaluationResult {
  // Rule order (fixed): enabled/supported (frozen policy), then fail-closed
  // binding, then fail-closed freshness, then digest matching, then per-evidence
  // freshness, then the R2B1 FAIL/PASS/insufficient verdict.
  if (!request.enabled) {
    return notEvaluatedResult(request, 'EVAL_V1_DISABLED')
  }
  if (!request.supported) {
    return notEvaluatedResult(request, 'EVAL_V1_UNSUPPORTED')
  }
  if (!hasCompleteBinding(request)) {
    // Fail-closed: without both digests the binding cannot be established, so no
    // evidence can participate and no PASS/FAIL verdict may be produced.
    return insufficientResult(request, 'EVAL_V1_NO_VALID_EVIDENCE', request.evidence.length)
  }
  if (request.evaluationAsOf === undefined || !isValidIsoTimestamp(request.evaluationAsOf)) {
    // Fail-closed: without a valid evaluation time no evidence can be judged fresh.
    return insufficientResult(request, FRESHNESS_RULES.NO_EVALUATION_TIME, request.evidence.length)
  }
  if (!isEvidenceFreshnessPolicy(request.freshnessPolicy)) {
    // Fail-closed: without a usable freshness policy no evidence can pass.
    return insufficientResult(request, FRESHNESS_RULES.NO_FRESHNESS_POLICY, request.evidence.length)
  }
  const { retained, excluded } = normalizeEvidence(request.criterionId, request.evidence, {
    policyDigest: request.policyDigest as string,
    subjectDigest: request.subjectDigest as string
  })
  const { fresh, excluded: freshnessExcluded } = filterByFreshness(
    retained,
    request.evaluationAsOf,
    request.freshnessPolicy.maxAgeMs
  )
  const statuses = fresh.map(item => item.status)
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
    excluded,
    freshnessExclusions: freshnessExcluded
  })
  return {
    criterionId: request.criterionId,
    verdict: policyResult.verdict,
    policyVersion: 'r2b1-v1',
    ruleId: policyResult.ruleId,
    decisionTrace
  }
}
