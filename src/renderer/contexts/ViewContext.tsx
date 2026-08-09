import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export type AppView = 'workspace' | 'verification' | 'environment' | 'settings'

interface ViewContextType {
  currentView: AppView
  navigate: (view: AppView) => void
  railCollapsed: boolean
  toggleRail: () => void
  setRailCollapsed: (c: boolean) => void
  inspectorOpen: boolean
  toggleInspector: () => void
  setInspectorOpen: (open: boolean) => void
  paletteOpen: boolean
  openPalette: () => void
  closePalette: () => void
}

const ViewContext = createContext<ViewContextType | null>(null)

export function ViewProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<AppView>('workspace')
  const [railCollapsed, setRailCollapsedState] = useState(false)
  const [inspectorOpen, setInspectorOpenState] = useState(true)
  const [paletteOpen, setPaletteOpenState] = useState(false)

  const navigate = useCallback((view: AppView) => {
    setCurrentView(view)
    setPaletteOpenState(false)
  }, [])
  const toggleRail = useCallback(() => setRailCollapsedState(c => !c), [])
  const setRailCollapsed = useCallback((c: boolean) => setRailCollapsedState(c), [])
  const toggleInspector = useCallback(() => setInspectorOpenState(o => !o), [])
  const setInspectorOpen = useCallback((o: boolean) => setInspectorOpenState(o), [])
  const openPalette = useCallback(() => setPaletteOpenState(true), [])
  const closePalette = useCallback(() => setPaletteOpenState(false), [])

  // Global shell shortcuts: Ctrl/Cmd+K command palette, Ctrl/Cmd+B rail toggle,
  // Escape closes the palette. Centralized here so components never re-bind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpenState(p => !p)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setRailCollapsedState(c => !c)
        return
      }
      if (e.key === 'Escape') {
        setPaletteOpenState(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <ViewContext.Provider
      value={{
        currentView,
        navigate,
        railCollapsed,
        toggleRail,
        setRailCollapsed,
        inspectorOpen,
        toggleInspector,
        setInspectorOpen,
        paletteOpen,
        openPalette,
        closePalette
      }}
    >
      {children}
    </ViewContext.Provider>
  )
}

export function useView() {
  const ctx = useContext(ViewContext)
  if (!ctx) throw new Error('useView must be used within ViewProvider')
  return ctx
}
