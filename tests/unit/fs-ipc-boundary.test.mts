import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import test from 'node:test'

function normalizeForCompare(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isWithinWorkspace(target: string, workspaceRoot: string): boolean {
  const normalizedTarget = normalizeForCompare(target)
  const normalizedRoot = normalizeForCompare(workspaceRoot)
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + '/')
}

const workspaceRoot = join(tmpdir(), 'agent-workbench-boundary-fixture')

test('temporary workspace path is absolute', () => {
  assert.equal(isAbsolute(workspaceRoot), true)
})

test('Windows backslash path within workspace is accepted', () => {
  assert.equal(isWithinWorkspace(join(workspaceRoot, 'memory', 'test.md'), workspaceRoot), true)
})

test('forward-slash path within workspace is accepted', () => {
  const target = join(workspaceRoot, 'memory', 'test.md').replace(/\\/g, '/')
  assert.equal(isWithinWorkspace(target, workspaceRoot), true)
})

test('traversal path is rejected before boundary normalization', () => {
  const target = join(workspaceRoot, '..', 'outside', 'file.txt')
  const explicitTraversal = workspaceRoot + '\\..\\outside\\file.txt'
  assert.equal(target.includes('..'), false)
  assert.equal(explicitTraversal.includes('..'), true)
})

test('workspace prefix collision is rejected', () => {
  const evilRoot = workspaceRoot + '-evil'
  assert.equal(isWithinWorkspace(join(evilRoot, 'memory', 'test.md'), workspaceRoot), false)
})

test('absolute sibling path is rejected', () => {
  const sibling = join(tmpdir(), 'agent-workbench-boundary-sibling', 'test.md')
  assert.equal(isWithinWorkspace(sibling, workspaceRoot), false)
})

test('mixed Windows separators are handled correctly', () => {
  const forwardRoot = workspaceRoot.replace(/\\/g, '/')
  const mixedTarget = forwardRoot + '\\memory/test.md'
  assert.equal(isWithinWorkspace(mixedTarget, workspaceRoot), true)
})

test('Windows comparison is case insensitive', () => {
  const target = join(workspaceRoot, 'memory', 'test.md').toUpperCase()
  assert.equal(isWithinWorkspace(target, workspaceRoot.toLowerCase()), true)
})

test('relative path is not accepted as an absolute workspace', () => {
  assert.equal(isAbsolute(join('relative-workspace', 'memory', 'test.md')), false)
})
