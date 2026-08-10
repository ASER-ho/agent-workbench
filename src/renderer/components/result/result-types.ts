// Result / Evidence Production Workbench — shared presentational prop contracts.
//
// These interfaces are the integration boundary for Agent B's Verification flow:
//   - ResultWorkbench          — the main RESULT-stage work surface
//   - ResultInspectorContent   — the right-side Inspector body
//
// Both are strictly presentational (no effects, no IPC). The integration agent
// owns selection state and real export dispatch; this module only describes the
// props they must supply.

import type { ControlledVerificationResult } from '../../../shared/controlled-verification-execution-types'
import type { VerificationReceipt } from '../../../shared/verification-receipt-types'

export type ResultLocale = 'zh' | 'en'

/** Real export kinds the Main process accepts for the immutable Receipt. */
export type ResultExportKind = 'json' | 'md' | 'both'

/** Selection state is controlled by the parent; this workbench stays stateless. */
export interface ResultSelectionHandlers {
  /** Currently selected criterion id (drives the Inspector). */
  selectedCriterionId?: string | null
  /** Currently selected evidence id (drives the Inspector). */
  selectedEvidenceId?: string | null
  onSelectCriterion?: (criterionId: string | null) => void
  onSelectEvidence?: (evidenceId: string | null) => void
}

export interface ResultWorkbenchProps extends ResultSelectionHandlers {
  /** The real ControlledVerificationResult produced by the Main process. */
  result: ControlledVerificationResult
  locale?: ResultLocale
  /**
   * The immutable Verification Receipt, when the completed verification has
   * materialized one. Optional — the workbench also renders the execution result
   * directly from `result`. Only a real receipt enables the full Receipt
   * identity/digest and the real Markdown Handoff preview.
   */
  receipt?: VerificationReceipt | null
  /**
   * Real export dispatcher. When supplied, the Receipt section renders the real
   * JSON / Markdown / Both export actions. When omitted, export capabilities are
   * shown as read-only metadata and no fake buttons are rendered.
   */
  onExport?: (kind: ResultExportKind) => void
  exportPending?: boolean
}

export interface ResultInspectorContentProps extends ResultSelectionHandlers {
  result: ControlledVerificationResult
  locale?: ResultLocale
  receipt?: VerificationReceipt | null
}
