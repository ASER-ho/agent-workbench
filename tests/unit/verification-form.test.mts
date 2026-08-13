// Renderer verification-form helpers: submit-boundary path normalization and
// path-list validation. Pure TS module — importable by node --experimental-strip-types.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizePathList,
  validatePathList,
  validateVerificationPathLine,
  validateContract
} from '../../src/renderer/components/verification/verification-form.ts'
import type { VerificationContract } from '../../src/shared/verification-types.ts'

// ── normalizePathList: submit-boundary normalization ─────────────────────────

test('normalizePathList: trims leading/trailing spaces per line and removes blank lines', () => {
  assert.deepEqual(normalizePathList(['src', '  test  ', '', '   ']), ['src', 'test'])
  assert.deepEqual(normalizePathList(['.git', 'node_modules']), ['.git', 'node_modules'])
})

test('normalizePathList: preserves legal internal spaces in a path', () => {
  assert.deepEqual(normalizePathList(['docs/release notes']), ['docs/release notes'])
  assert.deepEqual(normalizePathList(['packages/my module']), ['packages/my module'])
})

test('normalizePathList: does not strip a dotdot-looking basename (notes..md)', () => {
  // Normalization only trims/filters; it must never drop a file whose name
  // merely contains the characters '..'.
  assert.deepEqual(normalizePathList(['notes..md', 'src']), ['notes..md', 'src'])
})

test('normalizePathList: keeps an all-blank input as an empty list', () => {
  assert.deepEqual(normalizePathList(['', '\n', '   ']), [])
})

// ── validateVerificationPathLine / validatePathList ──────────────────────────

test('validateVerificationPathLine: accepts relative paths with internal spaces', () => {
  assert.equal(validateVerificationPathLine('src'), undefined)
  assert.equal(validateVerificationPathLine('docs/release notes'), undefined)
  assert.equal(validateVerificationPathLine('notes..md'), undefined, 'basename containing .. is legal')
})

test('validateVerificationPathLine: rejects traversal, absolute, UNC, and empty', () => {
  assert.ok(validateVerificationPathLine('..'))
  assert.ok(validateVerificationPathLine('../src'))
  assert.ok(validateVerificationPathLine('C:\\Windows'))
  assert.ok(validateVerificationPathLine('\\\\server\\share'))
  assert.ok(validateVerificationPathLine('   '))
  assert.ok(validateVerificationPathLine('/absolute'))
  assert.ok(validateVerificationPathLine('src/'))
})

test('validatePathList: empty required list is rejected; duplicate trimmed paths are rejected', () => {
  assert.ok(validatePathList([], false))
  assert.equal(validatePathList(['src', 'test'], false), undefined)
  assert.ok(validatePathList(['src', ' src '], false), 'duplicate after trim rejected')
  assert.equal(validatePathList([], true), undefined, 'allowEmpty forbiddenPaths may be empty')
})

// ── validateContract: live editing with raw lines still validates correctly ──

test('validateContract: tolerates raw (untrimmed / blank) path lines during editing', () => {
  const base: VerificationContract = {
    title: 't',
    goal: 'g',
    allowedPaths: ['src', '', 'test'],
    forbiddenPaths: ['.git', ''],
    acceptanceCriteria: ['a'],
    knownRisks: ['r']
  }
  const errors = validateContract(base, 'test/example.test.mjs')
  assert.equal(errors.allowedPaths, undefined)
  assert.equal(errors.forbiddenPaths, undefined)
})

test('validateContract: rejects a real traversal even when surrounded by valid lines', () => {
  const base: VerificationContract = {
    title: 't',
    goal: 'g',
    allowedPaths: ['src', '..', 'test'],
    forbiddenPaths: ['.git'],
    acceptanceCriteria: ['a'],
    knownRisks: ['r']
  }
  const errors = validateContract(base, 'test/example.test.mjs')
  assert.ok(errors.allowedPaths, 'real .. traversal must be rejected')
})
