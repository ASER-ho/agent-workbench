export type AgentSessionStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'exited'
  | 'crashed'
  | 'timed_out'
  | 'error'

export interface AgentDescriptor {
  adapterId: 'stub'
  agentLabel: string
  providerLabel: string
  modelLabel: string
  executableBasename: string
}

export interface SessionReadiness {
  workspaceSelected: boolean
  executableAvailable: boolean
  providerKnown: boolean
  modelKnown: boolean
  safetySatisfied: boolean
  noActiveSession: boolean
  userConfirmation: boolean
  readyToPrepare: boolean
  readyToStart: boolean
}

export interface SessionLaunchPlan extends AgentDescriptor {
  confirmationId: string
  fingerprint: string
  workspaceLabel: string
  riskCodes: Array<'workspace_access' | 'local_process'>
  canStop: true
  expiresAt: number
}

export interface SessionSnapshot extends AgentDescriptor {
  sessionId?: string
  status: AgentSessionStatus
  workspaceLabel?: string
  pid?: number
  exitCode?: number
  reason?: 'response_timeout' | 'spawn_error' | 'process_exit' | 'stop_timeout'
  updatedAt: number
}
