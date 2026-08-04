import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateCriterion } from '../../src/shared/criterion-evaluator.ts'
import type { EvaluationRequest } from '../../src/shared/evaluation-types.ts'

const POLICY = 'r2b1-v1'

function request(overrides: Partial<EvaluationRequest> = {}): EvaluationRequest {
  return {
    criterionId: 'C-001',
    enabled: true,
    supported: true,
    evidence: [],
    ...overrides
  }
}

test('disabled criterion evaluates to NOT_EVALUATED', () => {
  const out = evaluateCriterion(request({ enabled: false, evidence: [{ evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true }] }))
  assert.equal(out.verdict, 'NOT_EVALUATED')
  assert.equal(out.policyVersion, POLICY)
  assert.equal(out.ruleId, 'EVAL_V1_DISABLED')
})

test('unsupported criterion evaluates to NOT_EVALUATED', () => {
  const out = evaluateCriterion(request({ supported: false, evidence: [{ evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true }] }))
  assert.equal(out.verdict, 'NOT_EVALUATED')
  assert.equal(out.ruleId, 'EVAL_V1_UNSUPPORTED')
})

test('empty evidence evaluates to INSUFFICIENT_EVIDENCE', () => {
  const out = evaluateCriterion(request())
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_VALID_EVIDENCE')
})

test('UNKNOWN only evaluates to INSUFFICIENT_EVIDENCE', () => {
  const out = evaluateCriterion(request({ evidence: [{ evidenceId: 'e1', criterionId: 'C-001', status: 'UNKNOWN', valid: true }] }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'EVAL_V1_NO_VALID_EVIDENCE')
})

test('single PASS evaluates to VERIFIED', () => {
  const out = evaluateCriterion(request({ evidence: [{ evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true }] }))
  assert.equal(out.verdict, 'VERIFIED')
  assert.equal(out.ruleId, 'EVAL_V1_PASS_WITHOUT_FAIL')
})

test('multiple PASS evaluates to VERIFIED', () => {
  const out = evaluateCriterion(request({
    evidence: [
      { evidenceId: 'e2', criterionId: 'C-001', status: 'PASS', valid: true },
      { evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true }
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED')
})

test('single FAIL evaluates to FAILED', () => {
  const out = evaluateCriterion(request({ evidence: [{ evidenceId: 'e1', criterionId: 'C-001', status: 'FAIL', valid: true }] }))
  assert.equal(out.verdict, 'FAILED')
  assert.equal(out.ruleId, 'EVAL_V1_ANY_FAIL')
})

test('PASS + FAIL evaluates to FAILED (FAIL takes priority)', () => {
  const out = evaluateCriterion(request({
    evidence: [
      { evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true },
      { evidenceId: 'e2', criterionId: 'C-001', status: 'FAIL', valid: true }
    ]
  }))
  assert.equal(out.verdict, 'FAILED')
  assert.equal(out.ruleId, 'EVAL_V1_ANY_FAIL')
})

test('invalid evidence is ignored in the verdict', () => {
  const out = evaluateCriterion(request({
    evidence: [
      { evidenceId: 'e1', criterionId: 'C-001', status: 'FAIL', valid: false },
      { evidenceId: 'e2', criterionId: 'C-001', status: 'PASS', valid: true }
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED', 'invalid FAIL ignored, valid PASS wins')
})

test('evidence for a foreign criterion is ignored in the verdict', () => {
  const out = evaluateCriterion(request({
    evidence: [
      { evidenceId: 'e1', criterionId: 'C-002', status: 'FAIL', valid: true },
      { evidenceId: 'e2', criterionId: 'C-001', status: 'PASS', valid: true }
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED', 'foreign FAIL ignored, own PASS wins')
})

test('evidence order does not change the output', () => {
  const a = request({
    evidence: [
      { evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true },
      { evidenceId: 'e2', criterionId: 'C-001', status: 'UNKNOWN', valid: true },
      { evidenceId: 'e3', criterionId: 'C-001', status: 'FAIL', valid: true }
    ]
  })
  const b = request({
    evidence: [
      { evidenceId: 'e3', criterionId: 'C-001', status: 'FAIL', valid: true },
      { evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true },
      { evidenceId: 'e2', criterionId: 'C-001', status: 'UNKNOWN', valid: true }
    ]
  })
  const resultA = evaluateCriterion(a)
  const resultB = evaluateCriterion(b)
  assert.equal(resultA.criterionId, 'C-001')
  assert.equal(resultB.criterionId, 'C-001')
  // 输入证据顺序变化时，完整结果（含 criterionId 与 decisionTrace 数组）仍 deepEqual
  assert.deepEqual(resultA, resultB)
})

test('repeated execution produces deep-equal output', () => {
  const req = request({
    evidence: [
      { evidenceId: 'e2', criterionId: 'C-001', status: 'UNKNOWN', valid: true },
      { evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true }
    ]
  })
  const first = evaluateCriterion(req)
  const second = evaluateCriterion(req)
  assert.deepEqual(first, second)
})

test('decisionTrace contains the matched rule and stable normalized evidence', () => {
  const out = evaluateCriterion(request({
    evidence: [
      { evidenceId: 'e2', criterionId: 'C-001', status: 'UNKNOWN', valid: true },
      { evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true }
    ]
  }))
  const trace = out.decisionTrace.join('\n')
  assert.match(trace, /policy:r2b1-v1/)
  assert.match(trace, /criterion:C-001/)
  assert.match(trace, /rule:EVAL_V1_PASS_WITHOUT_FAIL/)
  assert.match(trace, /verdict:VERIFIED/)
  assert.match(trace, /valid-evidence:pass=1,fail=0,unknown=1/)
  assert.equal(out.criterionId, 'C-001')
})

test('output contains no Acceptance Decision', () => {
  const out = evaluateCriterion(request({
    evidence: [{ evidenceId: 'e1', criterionId: 'C-001', status: 'PASS', valid: true }]
  }))
  const rendered = JSON.stringify(out)
  assert.doesNotMatch(rendered, /ACCEPT|REJECT|HUMAN_REVIEW|ACCEPT_WITH_CONDITIONS/i)
  assert.equal((out as { acceptance?: unknown }).acceptance, undefined)
})
