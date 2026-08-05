import assert from 'node:assert/strict'
import test from 'node:test'

import { buildVerificationReceipt } from '../../src/shared/verification-receipt-builder.ts'
import { VERIFICATION_RECEIPT_SCHEMA } from '../../src/shared/verification-receipt-types.ts'
import type { VerificationReceiptInput } from '../../src/shared/verification-receipt-types.ts'

function baseInput(): VerificationReceiptInput {
  return {
    contract: {
      contractId: 'CONTRACT-001',
      contractDigest: 'contract-digest-a',
      criteria: [{ criterionId: 'C-FUNCTIONAL-VERIFIED', title: 'Functional' }]
    },
    workspace: {
      displayId: 'proj #1234',
      repositoryIdentityDigest: 'repo-digest-a'
    },
    subject: {
      subjectDigest: 'subject-digest-a',
      headOid: '0123456789abcdef0123456789abcdef01234567',
      complete: true
    },
    policy: {
      policyVersion: 'r2b1-v1',
      policyDigest: 'policy-digest-a',
      freshnessPolicyId: 'evidence-freshness-v1'
    },
    verification: {
      recipeType: 'node-test-v1',
      displaySafeCommand: 'node --test test/example.test.mjs',
      executionStatus: 'PASS',
      exitCode: 0,
      isolationLevel: 'PROCESS_BOUNDARY_ONLY',
      outputTruncated: false
    },
    evidence: [
      {
        evidenceId: 'ev-1',
        criterionId: 'C-FUNCTIONAL-VERIFIED',
        result: 'PASS',
        valid: true,
        policyDigest: 'policy-digest-a',
        subjectDigest: 'subject-digest-a',
        observedAt: '2026-08-05T10:00:00.000Z',
        exclusionReason: null
      }
    ],
    criterionResults: [
      {
        criterionId: 'C-FUNCTIONAL-VERIFIED',
        verdict: 'VERIFIED',
        ruleId: 'EVAL_V1_PASS_WITHOUT_FAIL',
        decisionTrace: ['policy:r2b1-v1']
      }
    ],
    overallVerdict: 'VERIFIED',
    unresolvedItems: [],
    acceptanceDecision: 'NOT_RECORDED'
  }
}

test('receipt: schemaVersion is fixed and correct', () => {
  const receipt = buildVerificationReceipt(baseInput())
  assert.equal(receipt.schemaVersion, 'aw-verification-receipt-v1')
  assert.equal(VERIFICATION_RECEIPT_SCHEMA, 'aw-verification-receipt-v1')
})

test('receipt: same input produces same digest', () => {
  const a = buildVerificationReceipt(baseInput())
  const b = buildVerificationReceipt(baseInput())
  assert.equal(a.receiptDigest, b.receiptDigest)
  assert.match(a.receiptDigest, /^[0-9a-f]{64}$/)
})

test('receipt: content change changes the digest', () => {
  const a = buildVerificationReceipt(baseInput())
  const changed = buildVerificationReceipt({ ...baseInput(), subject: { ...baseInput().subject, subjectDigest: 'different' } })
  assert.notEqual(a.receiptDigest, changed.receiptDigest)
})

test('receipt: receiptDigest is not self-referential', () => {
  const input = baseInput()
  const receipt = buildVerificationReceipt(input)
  // Digest must be independent of any pre-existing receiptDigest field (self-exclusion).
  const inputWithStaleDigest = { ...input, receiptDigest: 'f'.repeat(64) } as unknown as VerificationReceiptInput
  const receipt2 = buildVerificationReceipt(inputWithStaleDigest)
  assert.equal(receipt.receiptDigest, receipt2.receiptDigest, 'stale receiptDigest in input must not change output')
})

test('receipt: evidence and criterion results are sorted stably regardless of input order', () => {
  const input = baseInput()
  input.evidence = [
    { evidenceId: 'ev-2', criterionId: 'C-FUNCTIONAL-VERIFIED', result: 'UNKNOWN', valid: false, policyDigest: 'p', subjectDigest: 's', observedAt: '2026-08-05T10:00:00.000Z', exclusionReason: 'STALE_EVIDENCE' },
    { evidenceId: 'ev-1', criterionId: 'C-FUNCTIONAL-VERIFIED', result: 'PASS', valid: true, policyDigest: 'p', subjectDigest: 's', observedAt: '2026-08-05T10:00:00.000Z', exclusionReason: null }
  ]
  const receipt = buildVerificationReceipt(input)
  assert.deepEqual(receipt.evidence.map(e => e.evidenceId), ['ev-1', 'ev-2'])
})

test('receipt: non-VERIFIED receipt is still produced', () => {
  const input = baseInput()
  input.overallVerdict = 'FAILED'
  input.criterionResults[0].verdict = 'FAILED'
  input.verification.executionStatus = 'FAIL'
  input.verification.exitCode = 1
  const receipt = buildVerificationReceipt(input)
  assert.equal(receipt.overallVerdict, 'FAILED')
  assert.equal(receipt.acceptanceDecision, 'NOT_RECORDED')
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/)
})

test('receipt: absolute workspace or node path never appears in the receipt', () => {
  const input = baseInput()
  input.verification.displaySafeCommand = 'node --test test/example.test.mjs'
  const receipt = buildVerificationReceipt(input)
  const rendered = JSON.stringify(receipt)
  assert.equal(rendered.includes('C:\\Users'), false)
  assert.equal(rendered.includes('F:\\'), false)
  assert.equal(rendered.includes('node.exe'), false)
})

test('receipt: sensitive secret-shaped values never appear', () => {
  const input = baseInput()
  const receipt = buildVerificationReceipt(input)
  const rendered = JSON.stringify(receipt)
  assert.doesNotMatch(rendered, /sk-[A-Za-z0-9]{20}/i)
  assert.doesNotMatch(rendered, /ghp_[A-Za-z0-9]{20}/i)
  assert.doesNotMatch(rendered, /Bearer\s+[A-Za-z0-9._~+/-]{20}/i)
})

test('receipt: acceptanceDecision is fixed to NOT_RECORDED', () => {
  const receipt = buildVerificationReceipt(baseInput())
  assert.equal(receipt.acceptanceDecision, 'NOT_RECORDED')
  assert.doesNotMatch(JSON.stringify(receipt), /"ACCEPT"|"REJECT"/)
})

test('receipt: every contract/subject/policy/verdict change changes the digest', () => {
  const baseline = buildVerificationReceipt(baseInput())
  const variants = [
    { contract: { ...baseInput().contract, contractDigest: 'x' } },
    { subject: { ...baseInput().subject, headOid: 'a'.repeat(40) } },
    { policy: { ...baseInput().policy, policyDigest: 'x' } },
    { verification: { ...baseInput().verification, exitCode: 2 } },
    { evidence: [{ ...baseInput().evidence[0], evidenceId: 'ev-changed' }] },
    { overallVerdict: 'INSUFFICIENT_EVIDENCE' },
    { unresolvedItems: ['item'] }
  ]
  for (const variant of variants) {
    const receipt = buildVerificationReceipt({ ...baseInput(), ...variant })
    assert.notEqual(receipt.receiptDigest, baseline.receiptDigest, `variant ${Object.keys(variant)[0]} should change digest`)
  }
})
