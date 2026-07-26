import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface WorkspaceSection {
  name: string
  path: string
  items: Array<{
    name: string
    path: string
    isDirectory: boolean
    size: number
    mtime: string
  }>
}

interface WorkspaceState {
  loading: boolean
  error: string | null
  root: string
  sections: WorkspaceSection[]
}

const initialState: WorkspaceState = {
  loading: true,
  error: null,
  root: '',
  sections: []
}

interface WorkspaceContextType extends WorkspaceState {
  refresh: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(initialState)

  const refresh = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const tree = await window.api.workspace.refreshTree()
      setState({
        loading: false,
        error: null,
        root: tree.root,
        sections: tree.sections as WorkspaceSection[]
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load workspace'
      }))
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <WorkspaceContext.Provider value={{ ...state, refresh }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
