// Result / Evidence Production Workbench — pure display helpers.
//
// This module is intentionally free of React, DOM, IPC, and Electron. Everything
// here derives from REAL fields already present on the ControlledVerificationResult
// or the VerificationReceipt. It never recomputes a verdict — it only formats,
// labels, and groups data that the Main process produced.

import {
  CONTROLLED_VERIFICATION_CRITERION_ID,
  type ControlledVerificationEvidence,
  type ControlledVerificationResult
} from '../../../shared/controlled-verification-execution-types'
import type { CriterionVerdict, EvidenceStatus } from '../../../shared/evaluation-types'
import type {
  ReceiptCriterionResult,
  ReceiptEvidence,
  VerificationReceipt
} from '../../../shared/verification-receipt-types'
import type { ResultLocale } from './result-types'

// ── i18n ────────────────────────────────────────────────────────────────────

/** Inline zh/en fallback, matching the WorkspaceDesk pattern. Defaults to zh. */
export function tr(locale: ResultLocale | undefined, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

interface Bilingual {
  zh: string
  en: string
}

function pick(locale: ResultLocale | undefined, b: Bilingual): string {
  return tr(locale, b.zh, b.en)
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** Middle-truncate a long value (digests, Windows paths). Full value via title. */
export function truncateMiddle(value: string, maxStart = 14, maxEnd = 8): string {
  if (!value) return ''
  if (value.length <= maxStart + maxEnd + 1) return value
  return `${value.slice(0, maxStart)}…${value.slice(-maxEnd)}`
}

/** Human-readable ISO timestamp; never throws on malformed input. */
export function formatIso(iso: string | undefined | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

// ── Verdict / status semantics (labels only, never recomputed) ─────────────

export const VERDICT_LABEL: Record<CriterionVerdict, Bilingual> = {
  VERIFIED: { zh: '已验证', en: 'Verified' },
  FAILED: { zh: '验收失败', en: 'Failed' },
  INSUFFICIENT_EVIDENCE: { zh: '证据不足', en: 'Insufficient evidence' },
  NOT_EVALUATED: { zh: '未评估', en: 'Not evaluated' }
}

export function verdictLabel(locale: ResultLocale | undefined, verdict: CriterionVerdict): string {
  return pick(locale, VERDICT_LABEL[verdict])
}

export function verdictColor(verdict: CriterionVerdict): string {
  switch (verdict) {
    case 'VERIFIED': return 'var(--verified)'
    case 'FAILED': return 'var(--failed)'
    case 'INSUFFICIENT_EVIDENCE': return 'var(--warn)'
    case 'NOT_EVALUATED': return 'var(--text-tertiary)'
  }
}

export function verdictSoftBg(verdict: CriterionVerdict): string {
  switch (verdict) {
    case 'VERIFIED': return 'var(--verified-soft)'
    case 'FAILED': return 'var(--failed-soft)'
    case 'INSUFFICIENT_EVIDENCE': return 'var(--warn-soft)'
    case 'NOT_EVALUATED': return 'transparent'
  }
}

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, Bilingual> = {
  PASS: { zh: '通过', en: 'Pass' },
  FAIL: { zh: '失败', en: 'Fail' },
  UNKNOWN: { zh: '未知', en: 'Unknown' }
}

export function evidenceStatusLabel(locale: ResultLocale | undefined, status: EvidenceStatus): string {
  return pick(locale, EVIDENCE_STATUS_LABEL[status])
}

export function evidenceStatusColor(status: EvidenceStatus): string {
  switch (status) {
    case 'PASS': return 'var(--verified)'
    case 'FAIL': return 'var(--failed)'
    case 'UNKNOWN': return 'var(--warn)'
  }
}

export const COMMAND_STATUS_LABEL: Record<string, Bilingual> = {
  PASS: { zh: '通过', en: 'Passed' },
  FAIL: { zh: '失败', en: 'Failed' },
  TIMEOUT: { zh: '超时', en: 'Timed out' },
  CANCELLED: { zh: '已取消', en: 'Cancelled' },
  ERROR: { zh: '错误', en: 'Error' }
}

export const REJECTION_REASON_LABEL: Record<string, Bilingual> = {
  CONFIRMATION_NOT_FOUND: {
    zh: '确认不存在或已被新的预览替换。',
    en: 'Confirmation not found or replaced by a new preview.'
  },
  CONFIRMATION_CONSUMED: {
    zh: '该确认已被使用一次，不可重放。',
    en: 'This confirmation was already used once and cannot be replayed.'
  },
  CONFIRMATION_EXPIRED: {
    zh: '确认已过期，请重新生成预览。',
    en: 'The confirmation expired. Generate a new preview.'
  },
  CONFIRMATION_STALE: {
    zh: '代码或工作区已变化，确认失效，请重新生成预览。',
    en: 'The code or workspace changed. The confirmation is stale; generate a new preview.'
  },
  SUBJECT_SNAPSHOT_INCOMPLETE: {
    zh: '当前代码状态无法完整捕获，已拒绝执行。',
    en: 'The current code state could not be captured completely. Execution was refused.'
  }
}

// ── Decision trace (real lines from the evaluator) ─────────────────────────

export interface ParsedDecisionTrace {
  policy?: string
  criterion?: string
  validEvidence?: { pass: number; fail: number; unknown: number }
  excluded?: number
  freshnessExcluded?: { invalid: number; future: number; stale: number }
  rule?: string
  verdict?: string
}

export function parseDecisionTrace(lines: readonly string[]): ParsedDecisionTrace {
  const out: ParsedDecisionTrace = {}
  for (const line of lines) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep)
    const value = line.slice(sep + 1)
    if (key === 'valid-evidence') {
      const m = /pass=(\d+),fail=(\d+),unknown=(\d+)/.exec(value)
      if (m) out.validEvidence = { pass: Number(m[1]), fail: Number(m[2]), unknown: Number(m[3]) }
    } else if (key === 'excluded') {
      out.excluded = Number(value)
    } else if (key === 'freshness-excluded') {
      const m = /invalid=(\d+),future=(\d+),stale=(\d+)/.exec(value)
      if (m) out.freshnessExcluded = { invalid: Number(m[1]), future: Number(m[2]), stale: Number(m[3]) }
    } else if (key === 'rule') out.rule = value
    else if (key === 'verdict') out.verdict = value
    else if (key === 'criterion') out.criterion = value
    else if (key === 'policy') out.policy = value
  }
  return out
}

// ── Ledger row builders (real data only) ────────────────────────────────────

export interface CriterionRow {
  criterionId: string
  verdict: CriterionVerdict
  ruleId: string
  decisionTrace: string[]
  /** Evidence ids bound to this criterion (real ids only). */
  boundEvidenceIds: string[]
  freshCount: number
  totalEvidence: number
  /**
   * false when the immutable Receipt does not record per-criterion freshness.
   * The result-driven path has a real `fresh` field; the Receipt path does not,
   * so the ledger must not present a derived value as real.
   */
  freshnessRecorded: boolean
}

export interface EvidenceRow {
  evidenceId: string
  criterionId: string
  status: EvidenceStatus
  valid: boolean
  /** null when the immutable Receipt does not record per-evidence freshness. */
  fresh: boolean | null
  observedAt: string
  policyDigest: string
  subjectDigest: string
  source: 'result' | 'receipt'
}

function isExecuted(result: ControlledVerificationResult): result is Extract<ControlledVerificationResult, { state: 'executed' }> {
  return result.state === 'executed'
}

export function buildCriterionRows(
  result: ControlledVerificationResult,
  receipt: VerificationReceipt | null | undefined
): CriterionRow[] {
  if (receipt && receipt.criterionResults.length > 0) {
    return receipt.criterionResults.map((c: ReceiptCriterionResult) => {
      const bound = receipt.evidence.filter(e => e.criterionId === c.criterionId)
      return {
        criterionId: c.criterionId,
        verdict: c.verdict,
        ruleId: c.ruleId,
        decisionTrace: c.decisionTrace,
        boundEvidenceIds: bound.map(e => e.evidenceId),
        freshCount: 0,
        totalEvidence: bound.length,
        freshnessRecorded: false
      }
    })
  }
  if (isExecuted(result)) {
    const evidence = result.evidence
    return [{
      criterionId: evidence?.criterionId ?? CONTROLLED_VERIFICATION_CRITERION_ID,
      verdict: result.criterion.verdict,
      ruleId: result.criterion.ruleId,
      decisionTrace: result.criterion.decisionTrace,
      boundEvidenceIds: evidence ? [evidence.evidenceId] : [],
      freshCount: evidence?.fresh ? 1 : 0,
      totalEvidence: evidence ? 1 : 0,
      freshnessRecorded: true
    }]
  }
  return []
}

export function buildEvidenceRows(
  result: ControlledVerificationResult,
  receipt: VerificationReceipt | null | undefined
): EvidenceRow[] {
  if (receipt && receipt.evidence.length > 0) {
    return receipt.evidence.map((e: ReceiptEvidence) => ({
      evidenceId: e.evidenceId,
      criterionId: e.criterionId,
      status: e.result,
      valid: e.valid,
      fresh: null, // not recorded per-evidence in the immutable Receipt
      observedAt: e.observedAt,
      policyDigest: e.policyDigest,
      subjectDigest: e.subjectDigest,
      source: 'receipt' as const
    }))
  }
  if (isExecuted(result) && result.evidence) {
    const e: ControlledVerificationEvidence = result.evidence
    return [{
      evidenceId: e.evidenceId,
      criterionId: e.criterionId,
      status: e.status,
      valid: e.valid,
      fresh: e.fresh,
      observedAt: e.observedAt,
      policyDigest: e.policyDigest,
      subjectDigest: e.subjectDigest,
      source: 'result' as const
    }]
  }
  return []
}

// ── Attention / Next Action ────────────────────────────────────────────────

export interface AttentionItem {
  kind: CriterionVerdict | 'REJECTED'
  headline: Bilingual
  reasons: Bilingual[]
  next: Bilingual
}

/** Real-execution attention model. Never recomputes a verdict. */
export function buildAttention(result: ControlledVerificationResult): AttentionItem {
  if (result.state === 'rejected') {
    const reasonLabel = REJECTION_REASON_LABEL[result.reason] ?? REJECTION_REASON_LABEL.CONFIRMATION_NOT_FOUND
    return {
      kind: 'REJECTED',
      headline: { zh: '确认被拒绝', en: 'Confirmation rejected' },
      reasons: [reasonLabel],
      next: {
        zh: '生成新的验证预览并重新确认执行。',
        en: 'Generate a new verification preview and confirm execution again.'
      }
    }
  }

  const verdict = result.criterion.verdict
  const evidence = result.evidence
  const timeoutSec = Math.round(result.timeoutMs / 1000)

  switch (verdict) {
    case 'VERIFIED': {
      const reasons: Bilingual[] = [
        {
          zh: `测试命令通过（退出码 ${result.exitCode ?? '—'}），Subject 前后一致。`,
          en: `The test command passed (exit code ${result.exitCode ?? '—'}) and the subject stayed stable.`
        }
      ]
      if (evidence) {
        reasons.push({
          zh: `证据 ${evidence.evidenceId} 有效且新鲜。`,
          en: `Evidence ${evidence.evidenceId} is valid and fresh.`
        })
      }
      return {
        kind: 'VERIFIED',
        headline: { zh: '验证通过', en: 'Verified' },
        reasons,
        next: {
          zh: '查看 Receipt 并导出交接工件。验证通过不等于验收通过。',
          en: 'Review the Receipt and export the handoff artifact. Verification is not acceptance.'
        }
      }
    }
    case 'FAILED': {
      const reasons: Bilingual[] = [
        {
          zh: `测试未满足验收条件（退出码 ${result.exitCode ?? '—'}）。`,
          en: `Tests did not meet the acceptance criteria (exit code ${result.exitCode ?? '—'}).`
        }
      ]
      if (evidence) reasons.push({ zh: '证据状态为 FAIL。', en: 'Evidence status is FAIL.' })
      return {
        kind: 'FAILED',
        headline: { zh: '验证失败', en: 'Verification failed' },
        reasons,
        next: {
          zh: '修改实现后，生成新的验证预览并再次确认执行。',
          en: 'Modify the implementation, generate a new preview, and confirm execution again.'
        }
      }
    }
    case 'INSUFFICIENT_EVIDENCE': {
      const reasons: Bilingual[] = []
      if (result.subjectChangedDuringVerification) {
        reasons.push({
          zh: '验证期间 Subject 已变化；旧证据不再能证明当前 Subject。',
          en: 'The subject changed during verification; the old evidence no longer proves the current subject.'
        })
      }
      if (result.commandStatus === 'TIMEOUT') {
        reasons.push({
          zh: `测试命令超时（${timeoutSec}s），未产生新鲜证据。`,
          en: `The test command timed out (${timeoutSec}s); no fresh evidence was produced.`
        })
      }
      if (result.commandStatus === 'CANCELLED') {
        reasons.push({
          zh: '执行被取消，未记录证据。',
          en: 'Execution was cancelled; no evidence was recorded.'
        })
      }
      if (result.commandStatus === 'ERROR') {
        reasons.push({
          zh: '执行错误，未记录有效证据。',
          en: 'Execution error; no valid evidence was recorded.'
        })
      }
      if (evidence && !evidence.fresh) {
        reasons.push({
          zh: '证据不新鲜（早于新鲜度窗口）。',
          en: 'Evidence is stale (older than the freshness window).'
        })
      }
      if (evidence && !evidence.valid) {
        reasons.push({
          zh: '证据无效（Subject 绑定已失效）。',
          en: 'Evidence is invalid (subject binding broken).'
        })
      }
      if (reasons.length === 0) {
        reasons.push({
          zh: '缺少足够的有效且新鲜的证据。',
          en: 'Not enough valid and fresh evidence was recorded.'
        })
      }
      return {
        kind: 'INSUFFICIENT_EVIDENCE',
        headline: { zh: '证据不足', en: 'Insufficient evidence' },
        reasons,
        next: {
          zh: '针对当前 Subject 生成新的验证预览并重新确认执行。',
          en: 'Generate a new preview against the current subject and confirm execution again.'
        }
      }
    }
    case 'NOT_EVALUATED':
      return {
        kind: 'NOT_EVALUATED',
        headline: { zh: '未评估', en: 'Not evaluated' },
        reasons: [{ zh: '没有 Criterion 被评估。', en: 'No criteria were evaluated.' }],
        next: {
          zh: '生成验证预览并确认执行，以产生评估结果。',
          en: 'Generate a preview and confirm execution to produce an evaluation.'
        }
      }
  }
}

// ── Receipt helpers ─────────────────────────────────────────────────────────

/** The fixed acceptance decision the Receipt always carries. */
export const ACCEPTANCE_NOT_RECORDED = 'NOT_RECORDED' as const

export function receiptHasUnresolved(receipt: VerificationReceipt, item: string): boolean {
  return receipt.unresolvedItems.includes(item)
}
