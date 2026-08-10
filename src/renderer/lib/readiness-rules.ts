// ──────────────────────────────────────────
// Environment Readiness Rules — Phase 2A
// Pure functions; no side effects, no IPC, no file access.
// ──────────────────────────────────────────

import type { DiagnosticReport } from '../../shared/ipc-types'
import type { ProjectCapsule } from '../../shared/capsule-types'

export type CheckStatus = 'ok' | 'warn' | 'error' | 'unknown'
export type ReadyVerdict = 'ready' | 'almost-ready' | 'not-ready' | 'checking'

export interface ReadinessCheck {
  id: string
  label: string
  status: CheckStatus
  summary: string
  /** User-safe detail. Never contains paths, keys, or secrets. */
  detail?: string
}

export interface ReadinessResult {
  verdict: ReadyVerdict
  checks: ReadinessCheck[]
  okCount: number
  warnCount: number
  errorCount: number
  unknownCount: number
}

/** Look up a diagnostic item by id; returns undefined if not found. */
function findDiag(report: DiagnosticReport | null, id: string) {
  return report?.items.find(i => i.id === id)
}

/** Map diagnostic status to our simplified CheckStatus. */
function toCheckStatus(s: string | undefined): CheckStatus {
  if (!s) return 'unknown'
  if (s === 'ok') return 'ok'
  if (s === 'warn') return 'warn'
  if (s === 'error') return 'error'
  if (s === 'info') return 'ok' // info is informational, treat as ok for readiness
  return 'unknown'
}

/** Aggregate a list of diagnostics by their worst status. */
function worstOf(ids: string[], report: DiagnosticReport | null): CheckStatus {
  const order: CheckStatus[] = ['error', 'warn', 'unknown', 'ok']
  let worst: CheckStatus = 'ok'
  for (const id of ids) {
    const d = findDiag(report, id)
    const s = toCheckStatus(d?.status)
    if (order.indexOf(s) < order.indexOf(worst)) worst = s
  }
  return worst
}

/**
 * Build the readiness check list from available data sources.
 * All inputs come from existing preload APIs — no new IPC.
 */
export function evaluateReadiness(
  diagReport: DiagnosticReport | null,
  capsule: ProjectCapsule | null,
  capsuleSource: 'saved' | 'default' | 'fallback'
): ReadinessResult {
  const checks: ReadinessCheck[] = []

  // ── Toolchain ──
  const nodeStatus = worstOf(['node-path', 'node-version'], diagReport)
  checks.push({
    id: 'node', label: 'Node.js',
    status: nodeStatus,
    summary: nodeStatus === 'ok' ? 'Available' : nodeStatus === 'error' ? 'Not found' : 'Check needed',
    detail: nodeStatus === 'ok' ? findDiag(diagReport, 'node-version')?.displaySummary ?? findDiag(diagReport, 'node-version')?.summary : undefined
  })

  const npmStatus = worstOf(['npm-path', 'npm-version'], diagReport)
  checks.push({
    id: 'npm', label: 'npm',
    status: npmStatus,
    summary: npmStatus === 'ok' ? 'Available' : npmStatus === 'error' ? 'Not found' : 'Check needed',
    detail: npmStatus === 'ok' ? findDiag(diagReport, 'npm-version')?.displaySummary ?? findDiag(diagReport, 'npm-version')?.summary : undefined
  })

  const claudeStatus = worstOf(['claude-path', 'claude-version'], diagReport)
  checks.push({
    id: 'claude', label: 'Claude CLI',
    status: claudeStatus,
    summary: claudeStatus === 'ok' ? 'Available' : claudeStatus === 'error' ? 'Not installed' : 'Check needed'
  })

  // ── Environment ──
  const envStatus = worstOf(['env-anthropic_base_url', 'env-anthropic_auth_token', 'env-anthropic_api_key', 'env-anthropic_model'], diagReport)
  checks.push({
    id: 'env', label: 'Environment variables',
    status: envStatus,
    summary: envStatus === 'ok' ? 'Clean — no Anthropic env vars detected' : 'Anthropic env vars detected',
    detail: envStatus !== 'ok' ? 'System or user env vars could interfere with runtime. Run Safe Mode to clean.' : undefined
  })

  // ── Registry ──
  const regIds = ['reg-hkcu-anthropic_base_url', 'reg-hkcu-anthropic_auth_token', 'reg-hkcu-anthropic_api_key', 'reg-hkcu-anthropic_model',
    'reg-hklm-anthropic_base_url', 'reg-hklm-anthropic_auth_token', 'reg-hklm-anthropic_api_key', 'reg-hklm-anthropic_model']
  const regStatus = worstOf(regIds, diagReport)
  checks.push({
    id: 'registry', label: 'Windows Registry',
    status: regStatus,
    summary: regStatus === 'ok' ? 'Clean — no Anthropic values in registry' : 'Anthropic values found in registry',
    detail: regStatus !== 'ok' ? 'Registry entries could interfere with runtime.' : undefined
  })

  // ── Settings env ──
  const settingsEnv = findDiag(diagReport, 'settings-env')
  const settingsEnvStatus = toCheckStatus(settingsEnv?.status)
  checks.push({
    id: 'settings-env', label: 'Settings env',
    status: settingsEnvStatus,
    summary: settingsEnvStatus === 'ok' ? 'Clean — settings.json env section is empty' : 'settings.json env section has entries',
    detail: settingsEnv?.displaySummary ?? settingsEnv?.summary
  })

  // ── Build ──
  const buildOk = capsule?.safetyState?.buildStatus === 'pass'
  checks.push({
    id: 'build', label: 'Build',
    status: buildOk ? 'ok' : 'unknown',
    summary: buildOk ? 'Verified' : 'Build status unknown — run diagnostics'
  })

  // ── Capsule ──
  const capsuleOk = capsuleSource !== 'fallback'
  checks.push({
    id: 'capsule', label: 'Project Capsule',
    status: capsuleOk ? 'ok' : 'warn',
    summary: capsuleSource === 'saved' ? 'Restored from local storage' : capsuleSource === 'default' ? 'Using safe default' : 'Load error — using fallback',
    detail: capsuleSource === 'fallback' ? 'Capsule could not be restored. Project context may be incomplete.' : undefined
  })

  // ── Aggregate verdict ──
  let okCount = 0, warnCount = 0, errorCount = 0, unknownCount = 0
  for (const c of checks) {
    if (c.status === 'ok') okCount++
    else if (c.status === 'warn') warnCount++
    else if (c.status === 'error') errorCount++
    else unknownCount++
  }

  let verdict: ReadyVerdict
  if (errorCount > 0) verdict = 'not-ready'
  else if (warnCount > 0 || unknownCount > 0) verdict = 'almost-ready'
  else verdict = 'ready'

  return { verdict, checks, okCount, warnCount, errorCount, unknownCount }
}
