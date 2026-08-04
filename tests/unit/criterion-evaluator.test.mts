import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateCriterion } from '../../src/shared/criterion-evaluator.ts'
import type { EvaluationRequest } from '../../src/shared/evaluation-types.ts'

const POLICY = 'r2b1-v1'
const POLICY_DIGEST = 'policy-digest-a'
const SUBJECT_DIGEST = 'subject-digest-a'

function request(overrides: Partial<EvaluationRequest> = {}): EvaluationRequest {
  return {
    criterionId: 'C-001',
    enabled: true,
    supported: true,
    policyDigest: POLICY_DIGEST,
    subjectDigest: SUBJECT_DIGEST,
    evidence: [],
    ...overrides
  }
}

function ev(evidenceId: string, status: 'PASS' | 'FAIL' | 'UNKNOWN', extra: Partial<EvaluationRequest['evidence'][number]> = {}): EvaluationRequest['evidence'][number] {
  return {
    evidenceId,
    criterionId: 'C-001',
    status,
    valid: true,
    policyDigest: POLICY_DIGEST,
    subjectDigest: SUBJECT_DIGEST,
    ...extra
  }
}

test('disabled criterion evaluates to NOT_EVALUATED', () => {
  const out = evaluateCriterion(request({ enabled: false, evidence: [ev('e1', 'PASS')] }))
  assert.equal(out.verdict, 'NOT_EVALUATED')
  assert.equal(out.policyVersion, POLICY)
  assert.equal(out.ruleId, 'EVAL_V1_DISABLED')
})

test('unsupported criterion evaluates to NOT_EVALUATED', () => {
  const out = evaluateCriterion(request({ supported: false, evidence: [ev('e1', 'PASS')] }))
  assert.equal(out.verdict, 'NOT_EVALUATED')
  assert.equal(out.ruleId, 'EVAL_V1_UNSUPPORTED')
})

test('empty evidence evaluates to INSUFFICIENT_EVIDENCE', () => {
  const out = evaluateCriterion(request())
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_VALID_EVIDENCE')
})

test('UNKNOWN only evaluates to INSUFFICIENT_EVIDENCE', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'UNKNOWN')] }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_VALID_EVIDENCE')
})

test('single PASS evaluates to VERIFIED', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'PASS')] }))
  assert.equal(out.verdict, 'VERIFIED')
  assert.equal(out.ruleId, 'EVAL_V1_PASS_WITHOUT_FAIL')
})

test('multiple PASS evaluates to VERIFIED', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e2', 'PASS'), ev('e1', 'PASS')] }))
  assert.equal(out.verdict, 'VERIFIED')
})

test('single FAIL evaluates to FAILED', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'FAIL')] }))
  assert.equal(out.verdict, 'FAILED')
  assert.equal(out.ruleId, 'EVAL_V1_ANY_FAIL')
})

test('PASS + FAIL evaluates to FAILED (FAIL takes priority)', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'PASS'), ev('e2', 'FAIL')] }))
  assert.equal(out.verdict, 'FAILED')
  assert.equal(out.ruleId, 'EVAL_V1_ANY_FAIL')
})

test('invalid evidence is ignored in the verdict', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { valid: false }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED', 'invalid FAIL ignored, valid PASS wins')
})

test('evidence for a foreign criterion is ignored in the verdict', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { criterionId: 'C-002' }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED', 'foreign FAIL ignored, own PASS wins')
})

test('evidence order does not change the output', () => {
  const a = request({ evidence: [ev('e1', 'PASS'), ev('e2', 'UNKNOWN'), ev('e3', 'FAIL')] })
  const b = request({ evidence: [ev('e3', 'FAIL'), ev('e1', 'PASS'), ev('e2', 'UNKNOWN')] })
  const resultA = evaluateCriterion(a)
  const resultB = evaluateCriterion(b)
  assert.equal(resultA.criterionId, 'C-001')
  assert.equal(resultB.criterionId, 'C-001')
  // 输入证据顺序变化时，完整结果（含 criterionId 与 decisionTrace 数组）仍 deepEqual
  assert.deepEqual(resultA, resultB)
})

test('repeated execution produces deep-equal output', () => {
  const req = request({ evidence: [ev('e2', 'UNKNOWN'), ev('e1', 'PASS')] })
  const first = evaluateCriterion(req)
  const second = evaluateCriterion(req)
  assert.deepEqual(first, second)
})

test('decisionTrace contains the matched rule and stable normalized evidence', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e2', 'UNKNOWN'), ev('e1', 'PASS')] }))
  const trace = out.decisionTrace.join('\n')
  assert.match(trace, /policy:r2b1-v1/)
  assert.match(trace, /criterion:C-001/)
  assert.match(trace, /rule:EVAL_V1_PASS_WITHOUT_FAIL/)
  assert.match(trace, /verdict:VERIFIED/)
  assert.match(trace, /valid-evidence:pass=1,fail=0,unknown=1/)
  assert.equal(out.criterionId, 'C-001')
})

test('output contains no Acceptance Decision', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'PASS')] }))
  const rendered = JSON.stringify(out)
  assert.doesNotMatch(rendered, /ACCEPT|REJECT|HUMAN_REVIEW|ACCEPT_WITH_CONDITIONS/i)
  assert.equal((out as { acceptance?: unknown }).acceptance, undefined)
})
