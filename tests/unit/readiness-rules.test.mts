// Readiness-rules regression test (MAJOR-2).
//
// Proves the 0.1.2 Verification readiness verdict no longer depends on the
// (cut over) Provider/API config:
//   A. node/git/capsule OK with NO API input            -> READY
//   B. no api-* check exists in the result              -> API key present/absent cannot move the verdict
//   E. a real Verification environment failure          -> NOT_READY
//   E. a genuine warning (settings env)                 -> ALMOST_READY (honest degradation kept)
//
// Run:
//   node --experimental-strip-types --no-warnings --test tests/unit/readiness-rules.test.mts

import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateReadiness } from '../../src/renderer/lib/readiness-rules.ts'
import { createDefaultCapsule } from '../../src/shared/capsule-types.ts'
import type { DiagnosticItem, DiagnosticReport } from '../../src/shared/ipc-types.ts'

/** Build a DiagnosticReport from partial items; counts are derived. */
function diag(...items: Array<Pick<DiagnosticItem, 'id' | 'status'> & { summary?: string }>): DiagnosticReport {
  const fullItems: DiagnosticItem[] = items.map(it => ({
    id: it.id,
    title: it.id,
    status: it.status,
    summary: it.summary ?? '',
    ...(it.summary ? { summary: it.summary } : {})
  }))
  const counts = { ok: 0, warn: 0, error: 0, info: 0 }
  for (const i of fullItems) {
    if (i.status === 'ok') counts.ok++
    else if (i.status === 'warn') counts.warn++
    else if (i.status === 'error') counts.error++
    else counts.info++
  }
  return { timestamp: 0, items: fullItems, summary: counts }
}

/**
 * Environment report where every check the rules actually inspect is OK.
 * NB: worstOf() treats an ABSENT item as 'unknown' (worse than 'ok'), so every
 * id the rules read must be present with status 'ok' for a clean READY verdict.
 */
const OK_REPORT = diag(
  { id: 'node-path', status: 'ok' },
  { id: 'node-version', status: 'ok' },
  { id: 'npm-path', status: 'ok' },
  { id: 'npm-version', status: 'ok' },
  { id: 'claude-path', status: 'ok' },
  { id: 'claude-version', status: 'ok' },
  { id: 'env-anthropic_base_url', status: 'ok' },
  { id: 'env-anthropic_auth_token', status: 'ok' },
  { id: 'env-anthropic_api_key', status: 'ok' },
  { id: 'env-anthropic_model', status: 'ok' },
  { id: 'reg-hkcu-anthropic_base_url', status: 'ok' },
  { id: 'reg-hkcu-anthropic_auth_token', status: 'ok' },
  { id: 'reg-hkcu-anthropic_api_key', status: 'ok' },
  { id: 'reg-hkcu-anthropic_model', status: 'ok' },
  { id: 'reg-hklm-anthropic_base_url', status: 'ok' },
  { id: 'reg-hklm-anthropic_auth_token', status: 'ok' },
  { id: 'reg-hklm-anthropic_api_key', status: 'ok' },
  { id: 'reg-hklm-anthropic_model', status: 'ok' },
  { id: 'settings-env', status: 'ok' }
)

/** Capsule with buildStatus 'pass' so the build check is OK. */
const OK_CAPSULE = createDefaultCapsule('workspace')

test('A — Verification readiness is READY with node/git OK and no API config input', () => {
  const r = evaluateReadiness(OK_REPORT, OK_CAPSULE, 'saved')
  assert.equal(r.verdict, 'ready')
  assert.equal(r.errorCount, 0)
  assert.equal(r.warnCount, 0)
})

test('B — readiness result contains no api-* check, so API key cannot move the verdict', () => {
  const r = evaluateReadiness(OK_REPORT, OK_CAPSULE, 'saved')
  for (const c of r.checks) {
    assert.ok(!c.id.startsWith('api'), `unexpected api-* check: ${c.id}`)
    assert.ok(!/API key|provider/i.test(c.label), `unexpected legacy API copy in check: ${c.label}`)
  }
})

test('E — a real environment failure still degrades readiness to NOT_READY', () => {
  const bad = diag(...OK_REPORT.items.map(i => (i.id === 'node-path' ? { id: i.id, status: 'error' as const, summary: 'x' } : i)))
  const r = evaluateReadiness(bad, OK_CAPSULE, 'saved')
  assert.equal(r.verdict, 'not-ready')
  assert.ok(r.checks.some(c => c.id === 'node' && c.status === 'error'))
})

test('E — a genuine warning (settings env dirty) still degrades readiness to ALMOST_READY', () => {
  const warn = diag(...OK_REPORT.items.map(i => (i.id === 'settings-env' ? { id: i.id, status: 'warn' as const, summary: 'x' } : i)))
  const r = evaluateReadiness(warn, OK_CAPSULE, 'saved')
  assert.equal(r.verdict, 'almost-ready')
  assert.ok(r.checks.some(c => c.id === 'settings-env' && c.status === 'warn'))
})

test('capsule fallback still warns while toolchain OK (unchanged semantics)', () => {
  const r = evaluateReadiness(OK_REPORT, OK_CAPSULE, 'fallback')
  assert.equal(r.verdict, 'almost-ready')
  assert.ok(r.checks.some(c => c.id === 'capsule' && c.status === 'warn'))
})
