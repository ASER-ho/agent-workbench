// ResultWorkbench — 0.1.2-C Result / Evidence Production Work Surface.
//
// THE deliverable of this slice. A strictly presentational React component that
// Agent B's Verification flow renders at its RESULT stage (wired by the
// integration agent). It consumes ONLY the real ControlledVerificationResult and,
// when available, the immutable VerificationReceipt.
//
// Structure (not a dashboard):
//   Verdict → Explanation → Attention / Next Action → Criterion Ledger →
//   Evidence Ledger → Changes / Subject → Receipt → Handoff → Technical Details
//
// Constraints honored:
//   - Consumes the real overall verdict; never recomputes semantics.
//   - VERIFIED ≠ ACCEPTED; acceptance stays NOT_RECORDED.
//   - No Accept / Reject / Needs Work / Override / Assignee / Owner controls.
//   - No fake export buttons: real export actions only appear when onExport is
//     supplied by the integration agent (which dispatches the real IPC export).
//   - No useEffect / side effects; testable via renderToStaticMarkup.

import type { ControlledVerificationResult } from '../../../shared/controlled-verification-execution-types'
import type { VerificationReceipt } from '../../../shared/verification-receipt-types'
import type { ResultWorkbenchProps } from './result-types'
import { buildCriterionRows, buildEvidenceRows, tr } from './result-shared'
import AttentionPanel from './AttentionPanel'
import ChangesList, { type ChangeItem } from './ChangesList'
import CriterionLedger from './CriterionLedger'
import EvidenceLedger from './EvidenceLedger'
import HandoffSection from './HandoffSection'
import ReceiptCard from './ReceiptCard'
import ResultVerdict from './ResultVerdict'
import TechnicalDetails from './TechnicalDetails'

export default function ResultWorkbench({
  result,
  locale,
  receipt,
  selectedCriterionId,
  selectedEvidenceId,
  onSelectCriterion,
  onSelectEvidence,
  onExport,
  exportPending
}: ResultWorkbenchProps) {
  const criterionRows = buildCriterionRows(result, receipt)
  const evidenceRows = buildEvidenceRows(result, receipt)

  // Real subject / change information from the execution result.
  const changeItems: ChangeItem[] = []
  if (result.state === 'executed') {
    changeItems.push({
      id: 'subject-before',
      label: { zh: 'Subject Before', en: 'Subject before' },
      value: result.subjectBeforeDigest,
      title: result.subjectBeforeDigest,
      tone: 'muted'
    })
    if (result.subjectAfterDigest) {
      changeItems.push({
        id: 'subject-after',
        label: { zh: 'Subject After', en: 'Subject after' },
        value: result.subjectAfterDigest,
        title: result.subjectAfterDigest,
        tone: result.subjectStable ? 'ok' : 'warn'
      })
    }
    changeItems.push({
      id: 'subject-stable',
      label: { zh: 'Subject 前后一致', en: 'Subject stable' },
      value: result.subjectStable ? tr(locale, '是', 'Yes') : tr(locale, '否', 'No'),
      tone: result.subjectStable ? 'ok' : 'warn'
    })
    if (result.subjectChangedDuringVerification) {
      changeItems.push({
        id: 'subject-changed',
        label: { zh: '验证期间 Subject 变化', en: 'Changed during verification' },
        value: tr(locale, '检测到变化', 'Change detected'),
        tone: 'warn'
      })
    }
  }
  if (receipt && receipt.unresolvedItems.length > 0) {
    changeItems.push({
      id: 'unresolved',
      label: { zh: '未解决项', en: 'Unresolved' },
      value: receipt.unresolvedItems.join(', '),
      tone: 'warn'
    })
  }

  return (
    <div
      className="space-y-5"
      role="region"
      aria-label={tr(locale, '验证结果工作面', 'Verification result work surface')}
    >
      <ResultVerdict result={result} locale={locale} />
      <AttentionPanel result={result} locale={locale} />

      <CriterionLedger
        rows={criterionRows}
        locale={locale}
        selectedCriterionId={selectedCriterionId}
        onSelectCriterion={onSelectCriterion}
      />

      <EvidenceLedger
        rows={evidenceRows}
        locale={locale}
        selectedEvidenceId={selectedEvidenceId}
        onSelectEvidence={onSelectEvidence}
      />

      <ChangesList items={changeItems} locale={locale} />

      <ReceiptCard
        result={result}
        locale={locale}
        receipt={receipt}
        onExport={onExport}
        exportPending={exportPending}
      />

      <HandoffSection locale={locale} receipt={receipt} />

      <TechnicalDetails result={result} locale={locale} receipt={receipt} />
    </div>
  )
}

export type { ResultWorkbenchProps } from './result-types'
