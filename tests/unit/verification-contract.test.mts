import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPlainLanguageReceipt,
  classifyVerificationPath,
  validateVerificationContract
} from '../../src/shared/verification-validation.ts'

function validContract() {
  return {
    title: 'Review the parser change',
    goal: 'Confirm that the current Git changes stay inside the approved source area.',
    allowedPaths: ['src/app', 'tests/unit'],
    forbiddenPaths: ['src/app/private'],
    acceptanceCriteria: ['Scope is reported independently from functional correctness.'],
    knownRisks: ['No verification command has been run.']
  }
}

test('Verification Contract accepts only the independent minimum fields', () => {
  const contract = validateVerificationContract(validContract())
  assert.deepEqual(contract.allowedPaths, ['src/app', 'tests/unit'])
  assert.equal(JSON.stringify(contract).includes('agentId'), false)
  for (const field of ['agentId', 'provider', 'model', 'executable', 'cwd', 'env', 'pid']) {
    assert.throws(() => validateVerificationContract({ ...validContract(), [field]: 'forbidden' }), /forbidden field/i)
  }
})

test('Verification Contract rejects empty allowed paths and unsafe path forms', () => {
  assert.throws(() => validateVerificationContract({ ...validContract(), allowedPaths: [] }), /allowedPaths/i)
  const invalid = [
    'C:\\private', '\\\\server\\share', '\\\\?\\C:\\private', '\\\\.\\pipe\\name',
    '/absolute', '../escape', 'src/../escape', 'src/./file', 'src//file', 'src/'
  ]
  for (const path of invalid) {
    assert.throws(() => validateVerificationContract({ ...validContract(), allowedPaths: [path] }), /path/i, path)
  }
})

test('scope matching is Windows-case-insensitive, segment-aware, and forbidden-first', () => {
  const contract = validateVerificationContract(validContract())
  assert.equal(classifyVerificationPath('SRC\\APP\\index.ts', contract), 'allowed')
  assert.equal(classifyVerificationPath('src/app/private/token.ts', contract), 'forbidden')
  assert.equal(classifyVerificationPath('src/application/index.ts', contract), 'outsideScope')
  assert.equal(classifyVerificationPath('docs/readme.md', contract), 'outsideScope')
})

test('plain-language receipt keeps six fixed sections and never overclaims without a command', () => {
  const receipt = buildPlainLanguageReceipt({
    gitRead: true,
    scopeCompliant: true,
    changedCount: 2,
    forbiddenCount: 0,
    outsideScopeCount: 0,
    truncated: false
  })
  assert.deepEqual(receipt.sections.map(section => section.id), [
    'result', 'handoff', 'why', 'confirmed', 'unconfirmed', 'next'
  ])
  const rendered = JSON.stringify(receipt)
  assert.doesNotMatch(rendered, /\bVERIFIED\b|全部测试通过|任务已经完成。|可以无条件交接/i)
  assert.match(rendered, /尚未运行|还不能确认/)
  assert.equal(receipt.functionalVerificationPerformed, false)
})

test('plain-language receipt remains conservative for forbidden or outside-scope changes', () => {
  const receipt = buildPlainLanguageReceipt({
    gitRead: true,
    scopeCompliant: false,
    changedCount: 3,
    forbiddenCount: 1,
    outsideScopeCount: 1,
    truncated: false
  })
  assert.match(JSON.stringify(receipt), /范围外|禁止范围|不能作为已完成/)
})
