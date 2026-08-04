export interface VerificationContract {
  title: string
  goal: string
  allowedPaths: string[]
  forbiddenPaths: string[]
  acceptanceCriteria: string[]
  knownRisks: string[]
}

export type VerificationPathClassification = 'allowed' | 'forbidden' | 'outsideScope'
export type VerificationChangeState = 'staged' | 'unstaged' | 'untracked'
export type VerificationChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unmerged' | 'unknown'

export interface VerificationChange {
  path: string
  oldPath?: string
  newPath?: string
  changeType: VerificationChangeType
  states: VerificationChangeState[]
  classification: VerificationPathClassification
}

export interface VerificationRepositoryIdentity {
  displayName: string
  displayId: string
  branch: string
  head: string
}

export type PlainReceiptSectionId = 'result' | 'handoff' | 'why' | 'confirmed' | 'unconfirmed' | 'next'

export interface PlainReceiptSection {
  id: PlainReceiptSectionId
  title: string
  content: string
}

export interface PlainVerificationReceipt {
  sections: PlainReceiptSection[]
  functionalVerificationPerformed: false
}

export interface VerificationInspection {
  repository: VerificationRepositoryIdentity
  gitRead: true
  changes: VerificationChange[]
  changedCount: number
  allowedCount: number
  forbiddenCount: number
  outsideScopeCount: number
  unexpectedCount: number
  scopeCompliant: boolean
  sanitizedSummary: string
  truncated: boolean
  diffDigest: string
  functionalVerificationPerformed: false
  receipt: PlainVerificationReceipt
}

export interface VerificationInspectRequest {
  contract: VerificationContract
}
