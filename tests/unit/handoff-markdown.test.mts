import assert from 'node:assert/strict'
import test from 'node:test'

import { renderHandoffMarkdown } from '../../src/shared/handoff-markdown.ts'
import { buildVerificationReceipt } from '../../src/shared/verification-receipt-builder.ts'
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

test('handoff: contains all ten fixed sections', () => {
  const markdown = renderHandoffMarkdown(buildVerificationReceipt(baseInput()))
  const required = [
    '# Agent Workbench Verification Handoff',
    '## 1. Verification Summary',
    '## 2. Contract and Criteria',
    '## 3. Verified Code Subject',
    '## 4. Verification Command',
    '## 5. Criterion Results',
    '## 6. Evidence Exclusions',
    '## 7. Unresolved Items',
    '## 8. Acceptance Decision',
    '## 9. Isolation and Safety Limitations',
    '## 10. Receipt Identity'
  ]
  for (const section of required) {
    assert.ok(markdown.includes(section), `missing section: ${section}`)
  }
})

test('handoff: VERIFIED is never written as ACCEPTED', () => {
  const markdown = renderHandoffMarkdown(buildVerificationReceipt(baseInput()))
  assert.match(markdown, /Overall Verification Verdict: VERIFIED/)
  assert.doesNotMatch(markdown, /Overall Verification Verdict: ACCEPTED/)
  assert.doesNotMatch(markdown, /ACCEPTED|ACCEPT_WITH_CONDITIONS|REJECTED/i)
})

test('handoff: non-VERIFIED receipt still renders', () => {
  const input = baseInput()
  input.overallVerdict = 'FAILED'
  input.criterionResults[0].verdict = 'FAILED'
  input.verification.executionStatus = 'FAIL'
  input.verification.exitCode = 1
  const markdown = renderHandoffMarkdown(buildVerificationReceipt(input))
  assert.match(markdown, /Overall Verification Verdict: FAILED/)
})

test('handoff: acceptance decision shown as NOT_RECORDED', () => {
  const markdown = renderHandoffMarkdown(buildVerificationReceipt(baseInput()))
  assert.match(markdown, /Acceptance Decision: NOT_RECORDED/)
})

test('handoff: isolation limitations are explicit', () => {
  const markdown = renderHandoffMarkdown(buildVerificationReceipt(baseInput()))
  assert.match(markdown, /PROCESS_BOUNDARY_ONLY/)
  assert.match(markdown, /NO_FILESYSTEM_SANDBOX/)
  assert.match(markdown, /NETWORK_NOT_ENFORCED/)
})

test('handoff: absolute paths are excluded', () => {
  const markdown = renderHandoffMarkdown(buildVerificationReceipt(baseInput()))
  assert.doesNotMatch(markdown, /C:\\Users\\/)
  assert.doesNotMatch(markdown, /F:\\/)
  assert.doesNotMatch(markdown, /node\.exe/)
})

test('handoff: sensitive outputs are excluded', () => {
  const markdown = renderHandoffMarkdown(buildVerificationReceipt(baseInput()))
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9]{20}/i)
  assert.doesNotMatch(markdown, /ghp_[A-Za-z0-9]{20}/i)
  assert.doesNotMatch(markdown, /Bearer\s+[A-Za-z0-9._~+/-]{20}/i)
})

test('handoff: subject digest and receipt digest are shown', () => {
  const receipt = buildVerificationReceipt(baseInput())
  const markdown = renderHandoffMarkdown(receipt)
  assert.match(markdown, /Subject Digest/)
  assert.match(markdown, /subject-digest-a/)
  assert.match(markdown, /Receipt Digest/)
  assert.match(markdown, new RegExp(receipt.receiptDigest))
})

test('handoff: repeated rendering is deterministic', () => {
  const receipt = buildVerificationReceipt(baseInput())
  assert.equal(renderHandoffMarkdown(receipt), renderHandoffMarkdown(receipt))
})
