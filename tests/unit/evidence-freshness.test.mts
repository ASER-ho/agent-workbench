import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateCriterion } from '../../src/shared/criterion-evaluator.ts'
import { classifyFreshness, isValidIsoTimestamp } from '../../src/shared/evidence-freshness-policy-v1.ts'
import type { EvaluationRequest, EvidenceFreshnessPolicy } from '../../src/shared/evaluation-types.ts'

const POLICY_DIGEST = 'policy-digest-a'
const SUBJECT_DIGEST = 'subject-digest-a'
// Fixed ISO timestamps only — never Date.now().
const AS_OF = '2026-08-04T10:00:00.000Z'
const ONE_DAY_MS = 86_400_000
const FRESHNESS_POLICY: EvidenceFreshnessPolicy = { policyId: 'evidence-freshness-v1', maxAgeMs: ONE_DAY_MS }

function request(overrides: Partial<EvaluationRequest> = {}): EvaluationRequest {
  return {
    criterionId: 'C-001',
    enabled: true,
    supported: true,
    policyDigest: POLICY_DIGEST,
    subjectDigest: SUBJECT_DIGEST,
    evaluationAsOf: AS_OF,
    freshnessPolicy: FRESHNESS_POLICY,
    evidence: [],
    ...overrides
  }
}

function ev(
  evidenceId: string,
  status: 'PASS' | 'FAIL' | 'UNKNOWN',
  extra: Partial<EvaluationRequest['evidence'][number]> = {}
): EvaluationRequest['evidence'][number] {
  return {
    evidenceId,
    criterionId: 'C-001',
    status,
    valid: true,
    policyDigest: POLICY_DIGEST,
    subjectDigest: SUBJECT_DIGEST,
    observedAt: AS_OF,
    ...extra
  }
}

// --- pure helper: isValidIsoTimestamp ---

test('isValidIsoTimestamp accepts canonical ISO timestamps', () => {
  assert.equal(isValidIsoTimestamp('2026-08-04T10:00:00.000Z'), true)
  assert.equal(isValidIsoTimestamp('2026-08-04T10:00:00Z'), true)
})

test('isValidIsoTimestamp rejects malformed timestamps', () => {
  assert.equal(isValidIsoTimestamp(''), false)
  assert.equal(isValidIsoTimestamp('not-a-timestamp'), false)
  assert.equal(isValidIsoTimestamp('2026-13-45T99:00:00.000Z'), false)
})

// --- pure helper: classifyFreshness ---

test('classifyFreshness returns null for fresh evidence', () => {
  assert.equal(classifyFreshness({ observedAt: AS_OF, evaluationAsOf: AS_OF, maxAgeMs: ONE_DAY_MS }), null)
})

test('classifyFreshness flags missing/malformed observedAt as INVALID_FRESHNESS_METADATA', () => {
  assert.equal(
    classifyFreshness({ observedAt: undefined, evaluationAsOf: AS_OF, maxAgeMs: ONE_DAY_MS }),
    'INVALID_FRESHNESS_METADATA'
  )
  assert.equal(
    classifyFreshness({ observedAt: 'not-a-timestamp', evaluationAsOf: AS_OF, maxAgeMs: ONE_DAY_MS }),
    'INVALID_FRESHNESS_METADATA'
  )
})

test('classifyFreshness flags future observedAt as FUTURE_EVIDENCE', () => {
  assert.equal(
    classifyFreshness({ observedAt: '2026-08-05T10:00:00.000Z', evaluationAsOf: AS_OF, maxAgeMs: ONE_DAY_MS }),
    'FUTURE_EVIDENCE'
  )
})

test('classifyFreshness flags too-old observedAt as STALE_EVIDENCE', () => {
  assert.equal(
    classifyFreshness({ observedAt: '2026-08-01T10:00:00.000Z', evaluationAsOf: AS_OF, maxAgeMs: ONE_DAY_MS }),
    'STALE_EVIDENCE'
  )
})

// --- rule order: enabled/supported and binding precede freshness ---

test('enabled/supported checks run before freshness checks', () => {
  const disabled = evaluateCriterion(request({
    enabled: false,
    evaluationAsOf: undefined,
    freshnessPolicy: undefined,
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(disabled.verdict, 'NOT_EVALUATED')
  assert.equal(disabled.ruleId, 'EVAL_V1_DISABLED')

  const unsupported = evaluateCriterion(request({
    supported: false,
    evaluationAsOf: undefined,
    freshnessPolicy: undefined,
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(unsupported.verdict, 'NOT_EVALUATED')
  assert.equal(unsupported.ruleId, 'EVAL_V1_UNSUPPORTED')
})

test('complete-binding check runs before freshness checks', () => {
  const out = evaluateCriterion(request({
    policyDigest: undefined,
    evaluationAsOf: undefined,
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_VALID_EVIDENCE')
})

// --- request-level fail-closed freshness checks ---

test('missing evaluationAsOf is fail-closed INSUFFICIENT_EVIDENCE', () => {
  const out = evaluateCriterion(request({
    evaluationAsOf: undefined,
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_EVALUATION_TIME')
})

test('malformed evaluationAsOf is fail-closed INSUFFICIENT_EVIDENCE', () => {
  const out = evaluateCriterion(request({
    evaluationAsOf: 'not-a-timestamp',
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_EVALUATION_TIME')
})

test('missing freshnessPolicy is fail-closed INSUFFICIENT_EVIDENCE', () => {
  const out = evaluateCriterion(request({
    freshnessPolicy: undefined,
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_FRESHNESS_POLICY')
})

test('invalid freshnessPolicy (non-finite maxAgeMs) is fail-closed', () => {
  const out = evaluateCriterion(request({
    freshnessPolicy: { policyId: 'evidence-freshness-v1', maxAgeMs: Number.NaN },
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_FRESHNESS_POLICY')
})

// --- per-evidence freshness exclusion ---

test('evidence missing observedAt is excluded (INVALID_FRESHNESS_METADATA)', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { observedAt: undefined }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED', 'freshness-excluded FAIL cannot FAIL the criterion')
  assert.match(out.decisionTrace.join('\n'), /freshness-excluded:invalid=1,future=0,stale=0/)
})

test('evidence with malformed observedAt is excluded (INVALID_FRESHNESS_METADATA)', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { observedAt: 'not-a-timestamp' }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED')
  assert.match(out.decisionTrace.join('\n'), /freshness-excluded:invalid=1,future=0,stale=0/)
})

test('evidence observed after evaluationAsOf is excluded (FUTURE_EVIDENCE)', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { observedAt: '2026-08-05T10:00:00.000Z' }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED')
  assert.match(out.decisionTrace.join('\n'), /freshness-excluded:invalid=0,future=1,stale=0/)
})

test('evidence older than maxAgeMs is excluded (STALE_EVIDENCE)', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { observedAt: '2026-08-01T10:00:00.000Z' }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED')
  assert.match(out.decisionTrace.join('\n'), /freshness-excluded:invalid=0,future=0,stale=1/)
})

test('evidence exactly at maxAgeMs boundary is fresh (not stale)', () => {
  const out = evaluateCriterion(request({
    evidence: [ev('e1', 'PASS', { observedAt: '2026-08-03T10:00:00.000Z' })]
  }))
  assert.equal(out.verdict, 'VERIFIED')
})

// --- interaction with digest matching and verdict ---

test('fresh evidence with matching digests and PASS yields VERIFIED', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'PASS')] }))
  assert.equal(out.verdict, 'VERIFIED')
  assert.equal(out.ruleId, 'EVAL_V1_PASS_WITHOUT_FAIL')
})

test('digest-mismatched evidence is still excluded by binding before freshness runs', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'PASS', { observedAt: '2026-08-01T10:00:00.000Z', policyDigest: 'WRONG' }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED')
  assert.match(out.decisionTrace.join('\n'), /freshness-excluded:invalid=0,future=0,stale=0/, 'WRONG-digest evidence excluded by binding, not counted as stale')
})

test('freshness-excluded FAIL cannot cause FAILED (all excluded → INSUFFICIENT)', () => {
  const allExcluded = evaluateCriterion(request({
    evidence: [ev('e1', 'FAIL', { observedAt: '2026-08-01T10:00:00.000Z' })]
  }))
  assert.equal(allExcluded.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(allExcluded.ruleId, 'EVAL_V1_NO_VALID_EVIDENCE')
})

test('freshness-excluded FAIL cannot cause FAILED (fresh PASS remains → VERIFIED)', () => {
  const withFreshPass = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { observedAt: '2026-08-01T10:00:00.000Z' }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(withFreshPass.verdict, 'VERIFIED')
})

// --- determinism and decisionTrace format ---

test('identical input repeated execution is deep-equal (deterministic)', () => {
  const req = request({
    evidence: [
      ev('e1', 'PASS'),
      ev('e2', 'UNKNOWN', { observedAt: '2026-08-01T10:00:00.000Z' }),
      ev('e3', 'FAIL', { observedAt: 'not-a-date' })
    ]
  })
  const first = evaluateCriterion(req)
  const second = evaluateCriterion(req)
  assert.deepEqual(first, second)
})

test('evidence order does not change the full freshness result', () => {
  const a = request({
    evidence: [
      ev('e1', 'PASS'),
      ev('e2', 'FAIL', { observedAt: '2026-08-01T10:00:00.000Z' }),
      ev('e3', 'UNKNOWN', { observedAt: 'not-a-date' })
    ]
  })
  const b = request({
    evidence: [
      ev('e3', 'UNKNOWN', { observedAt: 'not-a-date' }),
      ev('e1', 'PASS'),
      ev('e2', 'FAIL', { observedAt: '2026-08-01T10:00:00.000Z' })
    ]
  })
  assert.deepEqual(evaluateCriterion(a), evaluateCriterion(b))
})

test('decisionTrace records freshness exclusion counts in fixed format', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'PASS'),
      ev('e2', 'FAIL', { observedAt: undefined }),
      ev('e3', 'PASS', { observedAt: '2026-08-05T10:00:00.000Z' }),
      ev('e4', 'UNKNOWN', { observedAt: '2026-08-01T10:00:00.000Z' })
    ]
  }))
  const trace = out.decisionTrace.join('\n')
  assert.match(trace, /freshness-excluded:invalid=1,future=1,stale=1/)
  assert.match(trace, /valid-evidence:pass=1,fail=0,unknown=0/)
  assert.match(trace, /rule:EVAL_V1_PASS_WITHOUT_FAIL/)
  assert.match(trace, /verdict:VERIFIED/)
})

test('decisionTrace is fixed-format even when no freshness exclusions occur', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'PASS')] }))
  const trace = out.decisionTrace.join('\n')
  assert.match(trace, /^policy:r2b1-v1$/m)
  assert.match(trace, /^criterion:C-001$/m)
  assert.match(trace, /^valid-evidence:pass=1,fail=0,unknown=0$/m)
  assert.match(trace, /^excluded:0$/m)
  assert.match(trace, /^freshness-excluded:invalid=0,future=0,stale=0$/m)
  assert.match(trace, /^rule:EVAL_V1_PASS_WITHOUT_FAIL$/m)
  assert.match(trace, /^verdict:VERIFIED$/m)
})
