import assert from 'node:assert/strict'
import test from 'node:test'

import { aggregateOverallVerdict } from '../../src/shared/overall-verdict.ts'
import type { CriterionVerdict } from '../../src/shared/evaluation-types.ts'

function criterion(criterionId: string, verdict: CriterionVerdict): { criterionId: string; verdict: CriterionVerdict } {
  return { criterionId, verdict }
}

test('overall: empty criterion results -> NOT_EVALUATED', () => {
  const out = aggregateOverallVerdict([])
  assert.equal(out.verdict, 'NOT_EVALUATED')
  assert.equal(out.ruleId, 'OVR_V1_NO_CRITERIA')
})

test('overall: any FAILED -> FAILED (highest priority)', () => {
  const out = aggregateOverallVerdict([
    criterion('C-001', 'VERIFIED'),
    criterion('C-002', 'FAILED'),
    criterion('C-003', 'INSUFFICIENT_EVIDENCE')
  ])
  assert.equal(out.verdict, 'FAILED')
  assert.equal(out.ruleId, 'OVR_V1_ANY_FAILED')
})

test('overall: no FAILED but INSUFFICIENT -> INSUFFICIENT_EVIDENCE', () => {
  const out = aggregateOverallVerdict([
    criterion('C-001', 'VERIFIED'),
    criterion('C-002', 'INSUFFICIENT_EVIDENCE')
  ])
  assert.equal(out.verdict, 'INSUFFICIENT_EVIDENCE')
  assert.equal(out.ruleId, 'OVR_V1_ANY_INSUFFICIENT')
})

test('overall: no FAILED/INSUFFICIENT but NOT_EVALUATED -> NOT_EVALUATED', () => {
  const out = aggregateOverallVerdict([
    criterion('C-001', 'VERIFIED'),
    criterion('C-002', 'NOT_EVALUATED')
  ])
  assert.equal(out.verdict, 'NOT_EVALUATED')
  assert.equal(out.ruleId, 'OVR_V1_ANY_NOT_EVALUATED')
})

test('overall: all VERIFIED -> VERIFIED', () => {
  const out = aggregateOverallVerdict([
    criterion('C-001', 'VERIFIED'),
    criterion('C-002', 'VERIFIED')
  ])
  assert.equal(out.verdict, 'VERIFIED')
  assert.equal(out.ruleId, 'OVR_V1_ALL_VERIFIED')
})

test('overall: criterion input order does not change the result', () => {
  const a = aggregateOverallVerdict([
    criterion('C-001', 'VERIFIED'),
    criterion('C-002', 'FAILED'),
    criterion('C-003', 'INSUFFICIENT_EVIDENCE')
  ])
  const b = aggregateOverallVerdict([
    criterion('C-003', 'INSUFFICIENT_EVIDENCE'),
    criterion('C-001', 'VERIFIED'),
    criterion('C-002', 'FAILED')
  ])
  assert.deepEqual(a, b)
})

test('overall: decisionTrace lists criteria in stable sorted order', () => {
  const out = aggregateOverallVerdict([
    criterion('C-002', 'VERIFIED'),
    criterion('C-001', 'VERIFIED')
  ])
  const trace = out.decisionTrace.join('\n')
  assert.match(trace, /criteria:C-001,C-002/)
  assert.match(trace, /rule:OVR_V1_ALL_VERIFIED/)
  assert.match(trace, /verdict:VERIFIED/)
})

test('overall: repeated execution produces deep-equal output', () => {
  const input = [
    criterion('C-001', 'VERIFIED'),
    criterion('C-002', 'INSUFFICIENT_EVIDENCE')
  ]
  assert.deepEqual(aggregateOverallVerdict(input), aggregateOverallVerdict(input))
})
