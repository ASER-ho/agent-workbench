// Workspace Foundation 核心类型。
// WorkspaceBinding 从 agent-adapters/types.ts 剥离而来，使工作区身份不依赖 Agent Adapter 层。

export interface WorkspaceBinding {
  workspaceId: string
  workspaceDisplayId: string
  cwd: string
}
