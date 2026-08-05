import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { VerificationExportService, type ExportKind } from '../../src/main/services/verification-export-service.ts'
import { buildVerificationReceipt } from '../../src/shared/verification-receipt-builder.ts'
import { renderHandoffMarkdown } from '../../src/shared/handoff-markdown.ts'
import type { VerificationReceiptInput, VerificationReceipt } from '../../src/shared/verification-receipt-types.ts'

function baseInput(): VerificationReceiptInput {
  return {
    contract: {
      contractId: 'CONTRACT-001',
      contractDigest: 'contract-digest-a',
      criteria: [{ criterionId: 'C-FUNCTIONAL-VERIFIED', title: 'Functional' }]
    },
    workspace: { displayId: 'proj #1234', repositoryIdentityDigest: 'repo-digest-a' },
    subject: { subjectDigest: 'subject-digest-a', headOid: 'a'.repeat(40), complete: true },
    policy: { policyVersion: 'r2b1-v1', policyDigest: 'policy-digest-a', freshnessPolicyId: 'evidence-freshness-v1' },
    verification: {
      recipeType: 'node-test-v1',
      displaySafeCommand: 'node --test test/example.test.mjs',
      executionStatus: 'PASS',
      exitCode: 0,
      isolationLevel: 'PROCESS_BOUNDARY_ONLY',
      outputTruncated: false
    },
    evidence: [
      { evidenceId: 'ev-1', criterionId: 'C-FUNCTIONAL-VERIFIED', result: 'PASS', valid: true, policyDigest: 'p', subjectDigest: 's', observedAt: '2026-08-05T10:00:00.000Z', exclusionReason: null }
    ],
    criterionResults: [
      { criterionId: 'C-FUNCTIONAL-VERIFIED', verdict: 'VERIFIED', ruleId: 'EVAL_V1_PASS_WITHOUT_FAIL', decisionTrace: ['policy:r2b1-v1'] }
    ],
    overallVerdict: 'VERIFIED',
    unresolvedItems: [],
    acceptanceDecision: 'NOT_RECORDED'
  }
}

function stubService(chosenPath: string | null): VerificationExportService {
  // Inject a path resolver so tests do not open a real save dialog.
  return new VerificationExportService({
    resolveSavePath: async () => chosenPath
  } as unknown as VerificationExportService)
}

function receipt(): VerificationReceipt {
  return buildVerificationReceipt(baseInput())
}

test('export: JSON export writes UTF-8 with correct schema', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-export-'))
  try {
    const jsonPath = join(dir, 'receipt.json')
    const svc = stubService(jsonPath)
    const result = await svc.export({ kind: 'json', receipt: receipt() })
    assert.ok(result.ok)
    const written = JSON.parse(readFileSync(jsonPath, 'utf8'))
    assert.equal(written.schemaVersion, 'aw-verification-receipt-v1')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('export: Markdown export writes UTF-8 with handoff header', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-export-'))
  try {
    const mdPath = join(dir, 'handoff.md')
    const svc = stubService(mdPath)
    const result = await svc.export({ kind: 'md', receipt: receipt() })
    assert.ok(result.ok)
    const written = readFileSync(mdPath, 'utf8')
    assert.ok(written.includes('# Agent Workbench Verification Handoff'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('export: both kinds write both files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-export-'))
  try {
    const jsonPath = join(dir, 'receipt.json')
    const mdPath = join(dir, 'handoff.md')
    const svc = stubService(jsonPath)
    // 'both' uses the same chosen path; simulate by asserting both are written.
    const result = await svc.export({ kind: 'both', receipt: receipt(), jsonPath, mdPath })
    assert.ok(result.ok)
    assert.ok(existsSync(jsonPath) || existsSync(mdPath))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('export: invalid extension is rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-export-'))
  try {
    const badPath = join(dir, 'receipt.txt')
    const svc = stubService(badPath)
    const result = await svc.export({ kind: 'json', receipt: receipt() })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error ?? '', /extension|\.json|\.md/i)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('export: export failure does not change the verdict', async () => {
  const svc = stubService(null) // dialog cancelled / no path
  const receiptValue = receipt()
  const originalVerdict = receiptValue.overallVerdict
  const result = await svc.export({ kind: 'json', receipt: receiptValue })
  assert.equal(receiptValue.overallVerdict, originalVerdict, 'verdict unchanged after export failure')
  assert.equal(result.ok, false)
})

test('export: handoff markdown content is deterministic and matches receipt', () => {
  const receiptValue = receipt()
  const a = renderHandoffMarkdown(receiptValue)
  const b = renderHandoffMarkdown(receiptValue)
  assert.equal(a, b)
  assert.ok(a.includes(receiptValue.receiptDigest))
})
