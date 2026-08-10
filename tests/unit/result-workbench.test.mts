// Standalone presentational test for the 0.1.2-C Result / Evidence Workbench.
//
// Validates ResultWorkbench and ResultInspectorContent via react-dom/server
// renderToStaticMarkup against real-type fixtures built from the real
// ControlledVerificationResult / VerificationReceipt shapes. JSX-free test file:
// it bundles the .tsx components with esbuild to a temp .mjs, then renders.
//
// Run:
//   node --experimental-strip-types --no-warnings --test tests/unit/result-workbench.test.mts

import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { ControlledVerificationResult } from '../../src/shared/controlled-verification-execution-types.ts'
import type { VerificationReceipt } from '../../src/shared/verification-receipt-types.ts'

const C = 'C-FUNCTIONAL-VERIFIED'
const EVID = 'ev-00000000-0000-0000-0000-000000000001'
const SUBJ = 'a'.repeat(64)
const POLICY = 'p'.repeat(64)
const TRACE_VERIFIED = [
  'policy:r2b1-v1',
  `criterion:${C}`,
  'valid-evidence:pass=1,fail=0,unknown=0',
  'excluded:0',
  'freshness-excluded:invalid=0,future=0,stale=0',
  'rule:EVAL_V1_PASS_WITHOUT_FAIL',
  'verdict:VERIFIED'
]
const TRACE_FAILED = [
  'policy:r2b1-v1',
  `criterion:${C}`,
  'valid-evidence:pass=0,fail=1,unknown=0',
  'excluded:0',
  'freshness-excluded:invalid=0,future=0,stale=0',
  'rule:EVAL_V1_ANY_FAIL',
  'verdict:FAILED'
]
const TRACE_INSUFFICIENT = [
  'policy:r2b1-v1',
  `criterion:${C}`,
  'valid-evidence:pass=0,fail=0,unknown=1',
  'excluded:0',
  'freshness-excluded:invalid=0,future=0,stale=0',
  'rule:EVAL_V1_NO_VALID_EVIDENCE',
  'verdict:INSUFFICIENT_EVIDENCE'
]

function executed(overrides: Partial<Extract<ControlledVerificationResult, { state: 'executed' }>> = {}): ControlledVerificationResult {
  return {
    state: 'executed',
    confirmationId: 'conf-1',
    commandPreview: 'node --test test/example.test.mjs',
    testPath: 'test/example.test.mjs',
    timeoutMs: 30000,
    isolationLevels: ['PROCESS_BOUNDARY_ONLY', 'NO_FILESYSTEM_SANDBOX', 'NETWORK_NOT_ENFORCED', 'ALLOWLISTED_ENVIRONMENT', 'WORKSPACE_FIXED_CWD'],
    commandStatus: 'PASS',
    exitCode: 0,
    startedAt: '2026-08-09T00:00:00.000Z',
    endedAt: '2026-08-09T00:00:01.000Z',
    observedAt: '2026-08-09T00:00:01.000Z',
    evaluationAsOf: '2026-08-09T00:00:01.000Z',
    stdout: 'ok 1 example passes',
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
    subjectBeforeDigest: SUBJ,
    subjectAfterDigest: SUBJ,
    subjectStable: true,
    subjectChangedDuringVerification: false,
    evidence: {
      evidenceId: EVID,
      criterionId: C,
      status: 'PASS',
      valid: true,
      fresh: true,
      policyDigest: POLICY,
      subjectDigest: SUBJ,
      observedAt: '2026-08-09T00:00:01.000Z'
    },
    criterion: { verdict: 'VERIFIED', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_PASS_WITHOUT_FAIL', decisionTrace: TRACE_VERIFIED },
    ...overrides
  }
}

function receiptFixture(overrides: Partial<VerificationReceipt> = {}): VerificationReceipt {
  return {
    schemaVersion: 'aw-verification-receipt-v1',
    receiptDigest: 'd'.repeat(64),
    contract: {
      contractId: 'R2D 闭环验收',
      contractDigest: 'c'.repeat(64),
      criteria: [{ criterionId: C, title: 'R2D 闭环验收' }]
    },
    workspace: { displayId: 'workspace', repositoryIdentityDigest: 'w'.repeat(64) },
    subject: { subjectDigest: SUBJ, headOid: null, complete: true },
    policy: { policyVersion: 'r2b1-v1', policyDigest: POLICY, freshnessPolicyId: 'evidence-freshness-v1' },
    verification: {
      recipeType: 'node-test-v1',
      displaySafeCommand: 'node --test test/example.test.mjs',
      executionStatus: 'PASS',
      exitCode: 0,
      isolationLevel: 'PROCESS_BOUNDARY_ONLY',
      outputTruncated: false
    },
    evidence: [{
      evidenceId: EVID,
      criterionId: C,
      result: 'PASS',
      valid: true,
      policyDigest: POLICY,
      subjectDigest: SUBJ,
      observedAt: '2026-08-09T00:00:01.000Z',
      exclusionReason: null
    }],
    criterionResults: [{
      criterionId: C,
      verdict: 'VERIFIED',
      ruleId: 'EVAL_V1_PASS_WITHOUT_FAIL',
      decisionTrace: TRACE_VERIFIED
    }],
    overallVerdict: 'VERIFIED',
    unresolvedItems: [],
    acceptanceDecision: 'NOT_RECORDED',
    ...overrides
  }
}

let ResultWorkbench: (props: Record<string, unknown>) => unknown
let ResultInspectorContent: (props: Record<string, unknown>) => unknown
let dir: string
let bundled = false

function render(Component: unknown, props: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(Component as never, props))
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aw-result-wb-'))
  const result = await build({
    entryPoints: {
      ResultWorkbench: join(process.cwd(), 'src', 'renderer', 'components', 'result', 'ResultWorkbench.tsx'),
      ResultInspectorContent: join(process.cwd(), 'src', 'renderer', 'components', 'result', 'ResultInspectorContent.tsx')
    },
    outdir: dir,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    logLevel: 'silent'
  })
  assert.equal(result.errors.length, 0, `esbuild errors: ${result.errors.map(e => e.text).join('; ')}`)
  const wbMod = await import(pathToFileURL(join(dir, 'ResultWorkbench.mjs')).href)
  const inspMod = await import(pathToFileURL(join(dir, 'ResultInspectorContent.mjs')).href)
  ResultWorkbench = wbMod.default
  ResultInspectorContent = inspMod.default
  bundled = true
})

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('bundle produced the two deliverables', () => {
  assert.equal(bundled, true)
  assert.equal(typeof ResultWorkbench, 'function')
  assert.equal(typeof ResultInspectorContent, 'function')
})

test('VERIFIED: renders verdict, explanation, next action, ledger, receipt, NOT_RECORDED', () => {
  const html = render(ResultWorkbench, { result: executed(), locale: 'zh' })
  assert.ok(html.includes('已验证'), 'verdict label present')
  assert.ok(html.includes('总体判定'), 'verdict section present')
  assert.ok(html.includes('下一步'), 'next action present')
  assert.ok(html.includes('测试命令通过'), 'explanation present')
  assert.ok(html.includes('Criterion 判定'), 'criterion ledger present')
  assert.ok(html.includes(C), 'criterion id present')
  assert.ok(html.includes('证据台账'), 'evidence ledger present')
  assert.ok(html.includes(EVID), 'evidence id present')
  assert.ok(html.includes('验证回执'), 'receipt section present')
  assert.ok(html.includes('NOT_RECORDED'), 'acceptance stays NOT_RECORDED')
  // VERIFIED is not ACCEPTED
  assert.ok(html.includes('VERIFIED 是验证判定'), 'VERIFIED != ACCEPTED disclosure')
})

test('VERIFIED: no fake accept/reject/override/assignee/owner controls', () => {
  const html = render(ResultWorkbench, { result: executed(), locale: 'en' })
  for (const forbidden of ['Accept', 'Reject', 'Needs Work', 'Override', 'Assignee', 'Owner', '批准', '拒绝']) {
    assert.ok(!html.includes(`>${forbidden}<`), `no ${forbidden} button`)
  }
})

test('FAILED: shows failure verdict, reason, and re-verify next action', () => {
  const html = render(ResultWorkbench, {
    result: executed({
      commandStatus: 'FAIL',
      exitCode: 1,
      evidence: { evidenceId: EVID, criterionId: C, status: 'FAIL', valid: true, fresh: true, policyDigest: POLICY, subjectDigest: SUBJ, observedAt: '2026-08-09T00:00:01.000Z' },
      criterion: { verdict: 'FAILED', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_ANY_FAIL', decisionTrace: TRACE_FAILED }
    }),
    locale: 'zh'
  })
  assert.ok(html.includes('验收失败'), 'FAILED verdict label')
  assert.ok(html.includes('测试未满足验收条件'), 'failure reason')
  assert.ok(html.includes('修改实现后，生成新的验证预览'), 're-verify next action')
})

test('INSUFFICIENT_EVIDENCE: explains missing evidence and next action', () => {
  const html = render(ResultWorkbench, {
    result: executed({
      commandStatus: 'ERROR',
      exitCode: null,
      evidence: { evidenceId: EVID, criterionId: C, status: 'UNKNOWN', valid: true, fresh: false, policyDigest: POLICY, subjectDigest: SUBJ, observedAt: '2026-08-09T00:00:01.000Z' },
      criterion: { verdict: 'INSUFFICIENT_EVIDENCE', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_NO_VALID_EVIDENCE', decisionTrace: TRACE_INSUFFICIENT }
    }),
    locale: 'zh'
  })
  assert.ok(html.includes('证据不足'), 'insufficient verdict label')
  assert.ok(html.includes('执行错误'), 'execution error reason')
  assert.ok(html.includes('证据不新鲜'), 'stale evidence reason')
  assert.ok(html.includes('针对当前 Subject 生成新的验证预览'), 'next action')
})

test('NOT_EVALUATED: shows not-evaluated with no-criteria explanation', () => {
  const html = render(ResultWorkbench, {
    result: executed({
      criterion: { verdict: 'NOT_EVALUATED', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_DISABLED', decisionTrace: ['policy:r2b1-v1', `criterion:${C}`, 'valid-evidence:pass=0,fail=0,unknown=0', 'excluded:0', 'freshness-excluded:invalid=0,future=0,stale=0', 'rule:EVAL_V1_DISABLED', 'verdict:NOT_EVALUATED'] }
    }),
    locale: 'zh'
  })
  assert.ok(html.includes('未评估'), 'NOT_EVALUATED label')
  assert.ok(html.includes('没有 Criterion 被评估'), 'no criteria explanation')
})

test('Subject Changed: old evidence no longer proves current subject', () => {
  const html = render(ResultWorkbench, {
    result: executed({
      subjectStable: false,
      subjectAfterDigest: 'b'.repeat(64),
      subjectChangedDuringVerification: true,
      evidence: { evidenceId: EVID, criterionId: C, status: 'UNKNOWN', valid: false, fresh: true, policyDigest: POLICY, subjectDigest: SUBJ, observedAt: '2026-08-09T00:00:01.000Z' },
      criterion: { verdict: 'INSUFFICIENT_EVIDENCE', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_NO_VALID_EVIDENCE', decisionTrace: TRACE_INSUFFICIENT }
    }),
    locale: 'zh'
  })
  assert.ok(html.includes('验证期间 Subject 已变化'), 'subject changed reason')
  assert.ok(html.includes('旧证据不再能证明当前 Subject'), 'old evidence no longer proves subject')
})

test('Stale evidence: INSUFFICIENT path explains stale evidence', () => {
  const html = render(ResultWorkbench, {
    result: executed({
      commandStatus: 'PASS',
      exitCode: 0,
      evidence: { evidenceId: EVID, criterionId: C, status: 'PASS', valid: true, fresh: false, policyDigest: POLICY, subjectDigest: SUBJ, observedAt: '2026-08-09T00:00:01.000Z' },
      criterion: { verdict: 'INSUFFICIENT_EVIDENCE', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_NO_VALID_EVIDENCE', decisionTrace: TRACE_INSUFFICIENT }
    }),
    locale: 'zh'
  })
  assert.ok(html.includes('证据不新鲜'), 'stale evidence surfaced in attention')
})

test('Timeout / Cancelled / Execution Error each surface distinct reasons (not generic error)', () => {
  const timeoutHtml = render(ResultWorkbench, {
    result: executed({
      commandStatus: 'TIMEOUT',
      exitCode: null,
      evidence: { evidenceId: EVID, criterionId: C, status: 'UNKNOWN', valid: true, fresh: false, policyDigest: POLICY, subjectDigest: SUBJ, observedAt: '2026-08-09T00:00:01.000Z' },
      criterion: { verdict: 'INSUFFICIENT_EVIDENCE', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_NO_VALID_EVIDENCE', decisionTrace: TRACE_INSUFFICIENT }
    }),
    locale: 'zh'
  })
  assert.ok(timeoutHtml.includes('测试命令超时'), 'timeout reason')

  const cancelledHtml = render(ResultWorkbench, {
    result: executed({
      commandStatus: 'CANCELLED',
      exitCode: null,
      evidence: null,
      criterion: { verdict: 'INSUFFICIENT_EVIDENCE', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_NO_VALID_EVIDENCE', decisionTrace: TRACE_INSUFFICIENT }
    }),
    locale: 'zh'
  })
  assert.ok(cancelledHtml.includes('执行被取消'), 'cancelled reason')

  const errorHtml = render(ResultWorkbench, {
    result: executed({
      commandStatus: 'ERROR',
      exitCode: null,
      evidence: null,
      criterion: { verdict: 'INSUFFICIENT_EVIDENCE', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_NO_VALID_EVIDENCE', decisionTrace: TRACE_INSUFFICIENT }
    }),
    locale: 'zh'
  })
  assert.ok(errorHtml.includes('执行错误'), 'execution error reason')
})

test('Rejected result: shows rejection reason and regenerate-preview next action', () => {
  const html = render(ResultWorkbench, {
    result: { state: 'rejected', confirmationId: 'conf-1', reason: 'CONFIRMATION_EXPIRED' },
    locale: 'zh'
  })
  assert.ok(html.includes('确认被拒绝'), 'rejected headline')
  assert.ok(html.includes('确认已过期'), 'expired reason')
  assert.ok(html.includes('生成新的验证预览'), 'regenerate next action')
})

test('Criterion Ledger renders real columns for multiple criteria (8-scale), selection marks row', () => {
  const receipt = receiptFixture({
    criterionResults: [
      { criterionId: 'C-001', verdict: 'VERIFIED', ruleId: 'EVAL_V1_PASS_WITHOUT_FAIL', decisionTrace: TRACE_VERIFIED },
      { criterionId: 'C-002', verdict: 'FAILED', ruleId: 'EVAL_V1_ANY_FAIL', decisionTrace: TRACE_FAILED }
    ],
    evidence: [
      { evidenceId: 'E-001', criterionId: 'C-001', result: 'PASS', valid: true, policyDigest: POLICY, subjectDigest: SUBJ, observedAt: '2026-08-09T00:00:01.000Z', exclusionReason: null },
      { evidenceId: 'E-002', criterionId: 'C-002', result: 'FAIL', valid: true, policyDigest: POLICY, subjectDigest: SUBJ, observedAt: '2026-08-09T00:00:01.000Z', exclusionReason: null }
    ],
    overallVerdict: 'FAILED'
  })
  const html = render(ResultWorkbench, { result: executed(), receipt, locale: 'zh', selectedCriterionId: 'C-002' })
  assert.ok(html.includes('C-001') && html.includes('C-002'), 'both criteria in ledger')
  assert.ok(html.includes('E-001') && html.includes('E-002'), 'evidence bound in ledger')
  // The receipt-driven criterion row for C-002 is FAILED.
  assert.ok(html.includes('验收失败'), 'FAILED criterion row verdict')
  assert.ok(/aria-selected="true"/.test(html), 'selected criterion row marked')
})

test('Evidence Ledger selection marks the selected row', () => {
  const html = render(ResultWorkbench, { result: executed(), locale: 'zh', selectedEvidenceId: EVID })
  assert.ok(/aria-selected="true"/.test(html), 'selected evidence row marked')
  assert.ok(html.includes('新鲜'), 'freshness answered')
})

test('Inspector: selected Criterion explains how Evidence affects the verdict', () => {
  const html = render(ResultInspectorContent, {
    result: executed(),
    locale: 'zh',
    selectedCriterionId: C
  })
  assert.ok(html.includes('证据如何影响该判定'), 'criterion explains evidence impact')
  assert.ok(html.includes('EVAL_V1_PASS_WITHOUT_FAIL'), 'rule id shown')
  assert.ok(html.includes('参与判定：有效且新鲜'), 'evidence participation explained')
})

test('Inspector: selected Evidence shows binding and effect on criterion', () => {
  const html = render(ResultInspectorContent, {
    result: executed(),
    locale: 'zh',
    selectedEvidenceId: EVID
  })
  assert.ok(html.includes('对 Criterion 结论的影响'), 'evidence explains effect on criterion')
  assert.ok(html.includes('Subject 绑定'), 'subject binding shown')
  assert.ok(html.includes('策略摘要'), 'policy digest in metadata (zh)')
})

test('Inspector default: verdict explanation + next action + receipt identity', () => {
  const html = render(ResultInspectorContent, {
    result: executed(),
    locale: 'zh',
    receipt: receiptFixture()
  })
  assert.ok(html.includes('总体判定'), 'verdict explanation shown by default')
  assert.ok(html.includes('下一步'), 'next action shown by default')
  assert.ok(html.includes('回执身份'), 'receipt identity shown when receipt present')
  assert.ok(html.includes('NOT_RECORDED'), 'acceptance NOT_RECORDED in inspector')
})

test('Receipt: full identity, digest, subject, exports available', () => {
  const receipt = receiptFixture()
  const html = render(ResultWorkbench, { result: executed(), receipt, locale: 'zh' })
  assert.ok(html.includes('aw-verification-receipt-v1'), 'schema shown')
  assert.ok(html.includes(receipt.receiptDigest), 'receipt digest shown')
  assert.ok(html.includes('Available exports') || html.includes('可用导出'), 'exports capability listed without onExport')
  // Without onExport there must be no export action buttons.
  assert.ok(!html.includes('导出 JSON Receipt'), 'no fake export button when onExport missing')
})

test('Receipt reopen: execution-only view has no digest; receipt view adds digest', () => {
  const withoutReceipt = render(ResultWorkbench, { result: executed(), locale: 'zh' })
  assert.ok(!withoutReceipt.includes('d'.repeat(64)), 'no receipt digest without receipt')

  const receipt = receiptFixture()
  const withReceipt = render(ResultWorkbench, { result: executed(), receipt, locale: 'zh' })
  assert.ok(withReceipt.includes(receipt.receiptDigest), 'receipt digest appears when receipt supplied')
})

test('Exports: real JSON/Markdown/Both export actions appear only when onExport is supplied', () => {
  const noHandler = render(ResultWorkbench, { result: executed(), locale: 'zh' })
  assert.ok(!noHandler.includes('导出 JSON Receipt'), 'no export button without handler')

  let dispatched: string[] = []
  const html = render(ResultWorkbench, {
    result: executed(),
    locale: 'zh',
    onExport: (kind: string) => { dispatched.push(kind) }
  })
  assert.ok(html.includes('导出 JSON Receipt'), 'JSON export button')
  assert.ok(html.includes('导出 Markdown Handoff'), 'Markdown export button')
  assert.ok(html.includes('导出两者'), 'both export button')
})

test('Markdown Handoff: real handoff rendered when receipt present; no fake when absent', () => {
  const without = render(ResultWorkbench, { result: executed(), locale: 'en' })
  assert.ok(!without.includes('# Agent Workbench Verification Handoff'), 'no fake handoff without receipt')

  const receipt = receiptFixture()
  const html = render(ResultWorkbench, { result: executed(), receipt, locale: 'en' })
  assert.ok(html.includes('# Agent Workbench Verification Handoff'), 'real handoff header')
  assert.ok(html.includes('Overall Verification Verdict: VERIFIED'), 'handoff overall verdict')
  assert.ok(html.includes('Acceptance Decision: NOT_RECORDED'), 'handoff acceptance NOT_RECORDED')
  assert.ok(html.includes(receipt.receiptDigest), 'handoff receipt digest')
})

test('Receipt with unresolved items surfaces them (subject changed / stale / timeout)', () => {
  const html = render(ResultWorkbench, {
    result: executed({ subjectChangedDuringVerification: true }),
    receipt: receiptFixture({
      overallVerdict: 'INSUFFICIENT_EVIDENCE',
      unresolvedItems: ['SUBJECT_CHANGED_DURING_VERIFICATION', 'STALE_EVIDENCE', 'EXECUTION_TIMEOUT'],
      criterionResults: [{ criterionId: C, verdict: 'INSUFFICIENT_EVIDENCE', ruleId: 'EVAL_V1_NO_VALID_EVIDENCE', decisionTrace: TRACE_INSUFFICIENT }]
    }),
    locale: 'zh'
  })
  assert.ok(html.includes('SUBJECT_CHANGED_DURING_VERIFICATION'), 'subject changed unresolved')
  assert.ok(html.includes('STALE_EVIDENCE'), 'stale evidence unresolved')
  assert.ok(html.includes('EXECUTION_TIMEOUT'), 'timeout unresolved')
})

test('Three-second UX: verdict appears before the next-action block', () => {
  const html = render(ResultWorkbench, { result: executed({ commandStatus: 'FAIL', exitCode: 1, criterion: { verdict: 'FAILED', policyVersion: 'r2b1-v1', ruleId: 'EVAL_V1_ANY_FAIL', decisionTrace: TRACE_FAILED } }), locale: 'zh' })
  const verdictIdx = html.indexOf('验收失败')
  const nextIdx = html.indexOf('现在应该做什么')
  assert.ok(verdictIdx !== -1 && nextIdx !== -1, 'verdict and next-action both present')
  assert.ok(verdictIdx < nextIdx, 'verdict surfaced before the next-action block')
})
