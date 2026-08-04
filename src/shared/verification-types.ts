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
  /** 摘要覆盖语义：complete=覆盖全部被采集 Diff；truncated-prefix=仅覆盖被保留截断前缀，不代表完整仓库 Diff、不代表 untracked 内容、不代表任务候选状态摘要。 */
  diffDigestCoverage: 'complete' | 'truncated-prefix'
  functionalVerificationPerformed: false
  receipt: PlainVerificationReceipt
}

export interface VerificationInspectRequest {
  contract: VerificationContract
}
