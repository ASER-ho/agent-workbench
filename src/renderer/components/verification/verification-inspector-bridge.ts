// Tiny module-scoped bridge that publishes the Verification Workbench's current
// inspector context. The workbench publishes a snapshot; the integration agent
// reads it when wiring VerificationInspectorContent into Inspector.tsx.
//
// This is renderer-only state (no IPC, no backend). If the integration agent
// prefers to lift state into a React context instead, they may ignore this
// bridge and drive VerificationInspectorContent with props directly.

import type { VerificationContract, VerificationInspection } from '../../../shared/verification-types'
import type {
  ControlledVerificationCommandStatus,
  ControlledVerificationPreview,
  ControlledVerificationResult
} from '../../../shared/controlled-verification-execution-types'

export type VerificationInspectorContext = 'contract' | 'subject' | 'execution' | 'running' | 'result'

export interface VerificationInspectorSnapshot {
  context: VerificationInspectorContext
  contract?: VerificationContract
  testPath?: string
  workspace?: { selected: boolean; displayName: string; displayId: string | null } | null
  inspection?: VerificationInspection | null
  preview?: ControlledVerificationPreview | null
  previewBusy?: boolean
  previewError?: string
  executing?: boolean
  elapsedSeconds?: number
  commandStatus?: ControlledVerificationCommandStatus
  /** Present when the workbench is at the RESULT stage (drives the Result inspector). */
  result?: ControlledVerificationResult | null
  /** Live Result selection — published so the Inspector mirrors the workbench. */
  selectedCriterionId?: string | null
  selectedEvidenceId?: string | null
}

type Listener = (snapshot: VerificationInspectorSnapshot) => void

let current: VerificationInspectorSnapshot = { context: 'contract' }
const listeners = new Set<Listener>()

export function publishVerificationInspector(snapshot: VerificationInspectorSnapshot): void {
  current = snapshot
  for (const listener of listeners) listener(snapshot)
}

export function subscribeVerificationInspector(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getVerificationInspector(): VerificationInspectorSnapshot {
  return current
}
