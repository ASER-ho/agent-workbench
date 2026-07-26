export type ActionType = 'command' | 'file_change'
export type ActionRiskLevel = 'low' | 'medium'
export type ActionReceiptStatus = 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed' | 'cancelled'

export interface CommandActionPreview {
  kind: 'command'
  executable: string
  arguments: string[]
  workingDirectoryLabel: string
  expectedImpact: string
}

export interface FileChangeActionPreview {
  kind: 'file_change'
  relativePath: string
  action: 'create'
  diff: string
  expectedImpact: string
}

export type ActionPreview = CommandActionPreview | FileChangeActionPreview

export interface ActionProposal {
  proposalId: string
  sessionId: string
  workspaceId: string
  workspaceLabel: string
  actionType: ActionType
  exactTarget: string
  preview: ActionPreview
  riskLevel: ActionRiskLevel
  createdAt: number
  expiresAt: number
  proposalHash: string
}

export interface ActionBinding {
  proposalId: string
  proposalHash: string
  sessionId: string
  workspaceId: string
}

export interface ActionApproval extends ActionBinding {
  approvalId: string
  approvedAt: number
  expiresAt: number
}

export interface WorkReceipt {
  receiptId: string
  proposalId: string
  proposalHash: string
  sessionId: string
  workspaceId: string
  workspaceLabel: string
  actionType: ActionType
  exactTarget: string
  status: ActionReceiptStatus
  proposedAt: number
  decidedAt?: number
  startedAt?: number
  endedAt?: number
  exitCode?: number
  stdoutSummary: string
  stderrSummary: string
  affectedFiles: string[]
  errorCategory?: 'approval_invalid' | 'session_changed' | 'path_boundary' | 'process_error' | 'cancelled'
}

export interface SafeSharePackage {
  markdown: string
  redactionsApplied: Array<'secret' | 'absolute_path' | 'username'>
}

export interface ActionExecutionResult {
  receipt: WorkReceipt
  diff: string
  handoff: string
  safeShare: SafeSharePackage
}
