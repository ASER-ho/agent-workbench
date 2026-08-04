import assert from 'node:assert/strict'
import test from 'node:test'

import { validateNodeTestRecipe } from '../../src/shared/verification-recipe-types.ts'
import {
  resolveTrustedNodeExecutable,
  resolveTrustedNodeFromCandidates
} from '../../src/main/services/trusted-node-executable.ts'

function validRecipe() {
  return {
    recipeType: 'node-test-v1',
    testPath: 'test/example.test.mjs',
    timeoutMs: 30000,
    expectedWorkspaceMutation: false
  }
}

test('Node test recipe accepts a valid node-test-v1 recipe', () => {
  const result = validateNodeTestRecipe(validRecipe())
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(result.recipe.recipeType, 'node-test-v1')
  assert.equal(result.recipe.testPath, 'test/example.test.mjs')
  assert.equal(result.recipe.timeoutMs, 30000)
  assert.equal(result.recipe.expectedWorkspaceMutation, false)
})

test('Node test recipe accepts .js, .mjs and .cjs test paths', () => {
  for (const extension of ['.js', '.mjs', '.cjs']) {
    const result = validateNodeTestRecipe({ ...validRecipe(), testPath: `test/example${extension}` })
    assert.ok(result.ok, `expected .${extension} to be accepted`)
  }
})

test('Node test recipe rejects .ts and .mts test paths', () => {
  for (const extension of ['.ts', '.mts']) {
    const result = validateNodeTestRecipe({ ...validRecipe(), testPath: `test/example${extension}` })
    assert.equal(result.ok, false, `expected .${extension} to be rejected`)
    if (!result.ok) assert.match(result.reason, /extension/i)
  }
})

test('Node test recipe rejects absolute, UNC/device, traversal and trailing-separator test paths', () => {
  const invalidPaths = [
    'C:\\private\\test.mjs',
    'C:/private/test.mjs',
    '\\\\server\\share\\test.mjs',
    '\\\\?\\C:\\private\\test.mjs',
    '\\\\.\\pipe\\test.mjs',
    '/absolute/test.mjs',
    '\\absolute\\test.mjs',
    'test/../escape.mjs',
    '../escape.mjs',
    'src/..\\escape.mjs',
    'test/example.mjs/'
  ]
  for (const testPath of invalidPaths) {
    const result = validateNodeTestRecipe({ ...validRecipe(), testPath })
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(testPath)}`)
  }
})

test('Node test recipe rejects unsupported test path extensions', () => {
  const invalidPaths = ['test/example.test.py', 'test/example.txt', 'test/example', 'test/example.test.tsx']
  for (const testPath of invalidPaths) {
    const result = validateNodeTestRecipe({ ...validRecipe(), testPath })
    assert.equal(result.ok, false, `expected rejection for ${testPath}`)
    if (!result.ok) assert.match(result.reason, /extension/i)
  }
})

test('Node test recipe accepts timeoutMs in [1, 60000]', () => {
  for (const timeoutMs of [1, 1000, 30000, 60000]) {
    const result = validateNodeTestRecipe({ ...validRecipe(), timeoutMs })
    assert.ok(result.ok, `expected timeoutMs=${timeoutMs} to be accepted`)
    if (result.ok) assert.equal(result.recipe.timeoutMs, timeoutMs)
  }
})

test('Node test recipe rejects non-positive, non-integer, over-limit and non-number timeoutMs', () => {
  const invalidTimeouts: unknown[] = [0, -1, 1.5, NaN, Infinity, 60001, '30000', null, true]
  for (const timeoutMs of invalidTimeouts) {
    const result = validateNodeTestRecipe({ ...validRecipe(), timeoutMs })
    assert.equal(result.ok, false, `expected rejection for timeoutMs=${String(timeoutMs)}`)
  }
})

test('Node test recipe defaults timeoutMs to 30000 when absent', () => {
  const result = validateNodeTestRecipe({
    recipeType: 'node-test-v1',
    testPath: 'test/example.test.mjs',
    expectedWorkspaceMutation: false
  })
  assert.ok(result.ok)
  if (result.ok) assert.equal(result.recipe.timeoutMs, 30000)
})

test('Node test recipe rejects expectedWorkspaceMutation other than strict false', () => {
  for (const value of [true, null, 0, 'false', 1, undefined]) {
    const input: Record<string, unknown> = { ...validRecipe() }
    if (value === undefined) delete input['expectedWorkspaceMutation']
    else input['expectedWorkspaceMutation'] = value
    const result = validateNodeTestRecipe(input)
    assert.equal(result.ok, false, `expected rejection for expectedWorkspaceMutation=${String(value)}`)
  }
})

test('Node test recipe rejects recipeType other than node-test-v1', () => {
  for (const recipeType of ['node-test-v2', 'python-test-v1', '', null, 123, undefined]) {
    const input: Record<string, unknown> = { ...validRecipe() }
    if (recipeType === undefined) delete input['recipeType']
    else input['recipeType'] = recipeType
    const result = validateNodeTestRecipe(input)
    assert.equal(result.ok, false, `expected rejection for recipeType=${String(recipeType)}`)
  }
})

test('Node test recipe rejects non-objects and missing required fields', () => {
  for (const input of [null, undefined, 'recipe', [], 42, true]) {
    assert.equal(validateNodeTestRecipe(input).ok, false, `expected rejection for ${String(input)}`)
  }
  const recipe = validRecipe()
  const missingTestPath: Record<string, unknown> = { ...recipe }
  delete missingTestPath['testPath']
  assert.equal(validateNodeTestRecipe(missingTestPath).ok, false)
  const missingMutation: Record<string, unknown> = { ...recipe }
  delete missingMutation['expectedWorkspaceMutation']
  assert.equal(validateNodeTestRecipe(missingMutation).ok, false)
})

test('trusted node accepts a real node.exe candidate and reports a 64-hex identityDigest', () => {
  const result = resolveTrustedNodeFromCandidates([process.execPath])
  assert.equal(result.trusted, true)
  if (!result.trusted) return
  assert.match(result.executable, /node\.exe$/i)
  assert.match(result.identityDigest, /^[0-9a-f]{64}$/)
})

test('trusted node rejects candidates whose basename is not node.exe', () => {
  const candidates = [
    'C:\\Program Files\\nodejs\\npm.exe',
    'C:\\Program Files\\nodejs\\node',
    'C:\\Program Files\\nodejs\\nodejs.exe',
    'C:\\Program Files\\nodejs\\node.exe.exe'
  ]
  for (const candidate of candidates) {
    const result = resolveTrustedNodeFromCandidates([candidate])
    assert.equal(result.trusted, false, `expected rejection for ${candidate}`)
  }
})

test('trusted node rejects relative path candidates', () => {
  const candidates = ['node.exe', '.\\node.exe', 'bin\\node.exe', 'nodejs/node.exe']
  for (const candidate of candidates) {
    const result = resolveTrustedNodeFromCandidates([candidate])
    assert.equal(result.trusted, false, `expected rejection for ${candidate}`)
  }
})

test('trusted node rejects a nonexistent absolute path candidate', () => {
  const result = resolveTrustedNodeFromCandidates(['C:\\Program Files\\nodejs\\definitely-not-here\\node.exe'])
  assert.equal(result.trusted, false)
})

test('trusted node rejects UNC and device path candidates', () => {
  const candidates = [
    '\\\\server\\share\\node.exe',
    '\\\\?\\C:\\Program Files\\nodejs\\node.exe',
    '\\\\.\\pipe\\node.exe'
  ]
  for (const candidate of candidates) {
    const result = resolveTrustedNodeFromCandidates([candidate])
    assert.equal(result.trusted, false, `expected rejection for ${candidate}`)
  }
})

test('trusted node returns a clear failure when no candidate is trusted', () => {
  const result = resolveTrustedNodeFromCandidates([])
  assert.equal(result.trusted, false)
  if (!result.trusted) assert.ok(result.reason.length > 0)
})

test('trusted node identityDigest is deterministic for the same canonical path', () => {
  const first = resolveTrustedNodeFromCandidates([process.execPath])
  const second = resolveTrustedNodeFromCandidates([process.execPath])
  assert.equal(first.trusted, true)
  assert.equal(second.trusted, true)
  if (first.trusted && second.trusted) {
    assert.equal(first.executable, second.executable)
    assert.equal(first.identityDigest, second.identityDigest)
  }
})

test('trusted node discovery honors the AGENT_WORKBENCH_NODE_EXECUTABLE env candidate', () => {
  const previous = process.env['AGENT_WORKBENCH_NODE_EXECUTABLE']
  process.env['AGENT_WORKBENCH_NODE_EXECUTABLE'] = process.execPath
  try {
    const result = resolveTrustedNodeExecutable()
    assert.equal(result.trusted, true)
    if (result.trusted) assert.match(result.identityDigest, /^[0-9a-f]{64}$/)
  } finally {
    if (previous === undefined) delete process.env['AGENT_WORKBENCH_NODE_EXECUTABLE']
    else process.env['AGENT_WORKBENCH_NODE_EXECUTABLE'] = previous
  }
})
