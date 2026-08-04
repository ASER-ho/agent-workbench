// 验收检查的响应新鲜度门禁（freshness guard）与工作区身份比较。
// 纯函数，不依赖 React，可独立单元测试。
//
// 语义：
// - inspect 发起时记录 requestId；工作区/Contract 变化时 invalidate() 递增 requestId。
// - 响应返回时用 shouldAccept(requestId) 判断是否仍是最新请求；不一致则丢弃响应。
// - 工作区身份一律用 displayId 比较（displayName 仅用于显示，两个项目可能有相同目录名）。

export interface InspectionGuardState {
  current: number
}

export function createInspectionGuard(): {
  invalidate: () => number
  begin: () => number
  shouldAccept: (requestId: number) => boolean
} {
  const state: InspectionGuardState = { current: 0 }
  return {
    invalidate(): number {
      state.current += 1
      return state.current
    },
    begin(): number {
      return state.current
    },
    shouldAccept(requestId: number): boolean {
      return requestId === state.current
    }
  }
}

export interface WorkspaceIdentity {
  selected: boolean
  displayId: string | null
}

export function sameWorkspace(a: WorkspaceIdentity | null, b: WorkspaceIdentity): boolean {
  return (
    a?.selected === b.selected &&
    a?.displayId === b.displayId
  )
}
