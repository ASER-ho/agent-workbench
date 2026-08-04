import assert from 'node:assert/strict'
import test from 'node:test'

import { createInspectionGuard, sameWorkspace } from '../../src/renderer/components/editors/inspection-guard.ts'

test('freshness guard accepts the current request and rejects stale ones', () => {
  const guard = createInspectionGuard()
  const reqA = guard.begin()
  assert.equal(guard.shouldAccept(reqA), true, 'current request accepted')
  guard.invalidate()
  assert.equal(guard.shouldAccept(reqA), false, 'stale request rejected after invalidate')
})

test('freshness guard: stale response from workspace A cannot overwrite workspace B result', () => {
  const guard = createInspectionGuard()
  const reqA = guard.begin()
  guard.invalidate() // workspace changed to B
  const reqB = guard.begin()
  // A 的响应晚于 B 返回
  assert.equal(guard.shouldAccept(reqA), false, 'workspace A late response rejected')
  assert.equal(guard.shouldAccept(reqB), true, 'workspace B current response accepted')
})

test('freshness guard: contract change during in-flight request drops the old response', () => {
  const guard = createInspectionGuard()
  const reqOld = guard.begin()
  guard.invalidate() // contract changed
  assert.equal(guard.shouldAccept(reqOld), false, 'pre-change response dropped')
})

test('freshness guard: failure path only surfaces for the current request', () => {
  const guard = createInspectionGuard()
  const reqOld = guard.begin()
  guard.invalidate()
  // 旧请求失败不应显示错误（界面已失效）
  assert.equal(guard.shouldAccept(reqOld), false)
  const reqCurrent = guard.begin()
  assert.equal(guard.shouldAccept(reqCurrent), true)
})

test('sameWorkspace compares displayId, not displayName', () => {
  // 两个不同项目可能拥有相同目录显示名
  assert.equal(
    sameWorkspace(
      { selected: true, displayId: 'proj-a #1' },
      { selected: true, displayId: 'proj-b #2' }
    ),
    false,
    'same displayName but different displayId is not the same workspace'
  )
  assert.equal(
    sameWorkspace(
      { selected: true, displayId: 'proj-a #1' },
      { selected: true, displayId: 'proj-a #1' }
    ),
    true
  )
  assert.equal(
    sameWorkspace(
      { selected: true, displayId: 'proj-a #1' },
      { selected: false, displayId: null }
    ),
    false
  )
  assert.equal(sameWorkspace(null, { selected: true, displayId: 'proj-a #1' }), false)
})
