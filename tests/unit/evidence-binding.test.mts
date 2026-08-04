import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateCriterion } from '../../src/shared/criterion-evaluator.ts'
import type { EvaluationRequest, PolicyDescriptor, SubjectSnapshot } from '../../src/shared/evaluation-types.ts'
import { digestPolicyDescriptor, digestSubjectSnapshot } from '../../src/main/utils/evidence-digest.ts'

const POLICY: PolicyDescriptor = {
  policyVersion: 'r2b1-v1',
  evaluatorRuleSet: ['EVAL_V1_DISABLED', 'EVAL_V1_UNSUPPORTED', 'EVAL_V1_ANY_FAIL', 'EVAL_V1_PASS_WITHOUT_FAIL', 'EVAL_V1_NO_VALID_EVIDENCE'],
  policyDigest: ''
}

const SUBJECT: SubjectSnapshot = {
  subjectId: 'S-001',
  subjectDigest: ''
}

// 真实 digest 作为默认绑定：request 与匹配证据共享同一 policyDigest/subjectDigest
const DEFAULT_POLICY_DIGEST = digestPolicyDescriptor(POLICY)
const DEFAULT_SUBJECT_DIGEST = digestSubjectSnapshot(SUBJECT)

function policyWith(content: Partial<PolicyDescriptor> = {}): PolicyDescriptor {
  return { ...POLICY, ...content }
}

function subjectWith(content: Partial<SubjectSnapshot> = {}): SubjectSnapshot {
  return { ...SUBJECT, ...content }
}

function request(overrides: Partial<EvaluationRequest> = {}): EvaluationRequest {
  return {
    criterionId: 'C-001',
    enabled: true,
    supported: true,
    policyDigest: DEFAULT_POLICY_DIGEST,
    subjectDigest: DEFAULT_SUBJECT_DIGEST,
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
    policyDigest: DEFAULT_POLICY_DIGEST,
    subjectDigest: DEFAULT_SUBJECT_DIGEST,
    ...extra
  }
}

// --- digest generation determinism ---

test('digest: identical policy produces identical digest', () => {
  const a = digestPolicyDescriptor(policyWith({ policyDigest: '' }))
  const b = digestPolicyDescriptor(policyWith({ policyDigest: '' }))
  assert.equal(a, b)
  assert.match(a, /^[0-9a-f]{64}$/)
})

test('digest: field order does not affect the policy digest', () => {
  const base = { policyVersion: 'r2b1-v1', evaluatorRuleSet: ['A', 'B'] }
  const reordered = { evaluatorRuleSet: ['A', 'B'], policyVersion: 'r2b1-v1' }
  assert.equal(digestPolicyDescriptor(base as PolicyDescriptor), digestPolicyDescriptor(reordered as PolicyDescriptor))
})

test('digest: policy content change changes the digest', () => {
  const a = digestPolicyDescriptor(policyWith({ policyVersion: 'r2b1-v1' }))
  const b = digestPolicyDescriptor(policyWith({ policyVersion: 'r2b1-v2' }))
  assert.notEqual(a, b)
})

test('digest: subject content change changes the digest', () => {
  const a = digestSubjectSnapshot(subjectWith({ subjectId: 'S-001' }))
  const b = digestSubjectSnapshot(subjectWith({ subjectId: 'S-002' }))
  assert.notEqual(a, b)
})

// --- evidence binding filtering ---

test('binding: evidence with mismatched policyDigest is excluded', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { policyDigest: 'WRONG-POLICY-DIGEST' }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED', 'mismatched FAIL excluded, matching PASS wins')
})

test('binding: evidence with mismatched subjectDigest is excluded', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { subjectDigest: 'WRONG-SUBJECT-DIGEST' }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED', 'mismatched FAIL excluded, matching PASS wins')
})

test('binding: evidence missing digests is excluded', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'FAIL', { policyDigest: undefined, subjectDigest: undefined }),
      ev('e2', 'PASS')
    ]
  }))
  assert.equal(out.verdict, 'VERIFIED', 'digest-missing FAIL excluded, matching PASS wins')
})

test('binding: mismatched FAIL cannot cause FAILED', () => {
  const out = evaluateCriterion(request({
    evidence: [ev('e1', 'FAIL', { policyDigest: 'WRONG' })]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE', 'all evidence excluded, no valid PASS/FAIL')
})

test('binding: matching PASS yields VERIFIED', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'PASS')] }))
  assert.equal(out.verdict, 'VERIFIED')
})

test('binding: matching PASS + matching FAIL still FAILED', () => {
  const out = evaluateCriterion(request({ evidence: [ev('e1', 'PASS'), ev('e2', 'FAIL')] }))
  assert.equal(out.verdict, 'FAILED')
})

test('binding: all evidence excluded yields INSUFFICIENT_EVIDENCE', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'PASS', { policyDigest: 'WRONG' }),
      ev('e2', 'FAIL', { subjectDigest: 'WRONG' })
    ]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
})

test('binding: decisionTrace stably records excluded counts', () => {
  const out = evaluateCriterion(request({
    evidence: [
      ev('e1', 'PASS', { policyDigest: 'WRONG' }),
      ev('e2', 'FAIL', { subjectDigest: 'WRONG' }),
      ev('e3', 'PASS', { valid: false }),
      ev('e4', 'PASS'),
      ev('e5', 'UNKNOWN')
    ]
  }))
  const trace = out.decisionTrace.join('\n')
  assert.match(trace, /excluded:3/)
  assert.match(trace, /verdict:VERIFIED/)
})

test('binding: evidence order does not change the full result', () => {
  const a = request({ evidence: [ev('e1', 'PASS'), ev('e2', 'FAIL', { policyDigest: 'WRONG' }), ev('e3', 'UNKNOWN')] })
  const b = request({ evidence: [ev('e3', 'UNKNOWN'), ev('e1', 'PASS'), ev('e2', 'FAIL', { policyDigest: 'WRONG' })] })
  assert.deepEqual(evaluateCriterion(a), evaluateCriterion(b))
})

test('binding: request missing policyDigest is fail-closed (no VERIFIED)', () => {
  const out = evaluateCriterion(request({
    policyDigest: undefined,
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE', 'missing policyDigest must not allow VERIFIED')
  assert.equal(out.ruleId, 'EVAL_V1_NO_VALID_EVIDENCE')
})

test('binding: request missing subjectDigest is fail-closed (no VERIFIED)', () => {
  const out = evaluateCriterion(request({
    subjectDigest: undefined,
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE', 'missing subjectDigest must not allow VERIFIED')
  assert.equal(out.ruleId, 'EVAL_V1_NO_VALID_EVIDENCE')
})

test('binding: fail-closed still reports NOT_EVALUATED before digest check', () => {
  // 规则顺序：disabled/unsupported 优先于 digest 绑定检查
  const out = evaluateCriterion(request({
    policyDigest: undefined,
    subjectDigest: undefined,
    enabled: false,
    evidence: [ev('e1', 'PASS')]
  }))
  assert.equal(out.verdict, 'NOT_EVALUATED', 'disabled wins over missing digest')
  assert.equal(out.ruleId, 'EVAL_V1_DISABLED')
})
