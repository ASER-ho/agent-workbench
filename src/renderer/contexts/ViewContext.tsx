import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

export type AppView = 'workspace' | 'verification' | 'environment' | 'settings'

interface ViewContextType {
  currentView: AppView
  navigate: (view: AppView) => void
  railCollapsed: boolean
  toggleRail: () => void
  setRailCollapsed: (c: boolean) => void
  inspectorOpen: boolean
  /** True once the user has explicitly toggled the Inspector (user choice wins over the responsive default). */
  inspectorUserToggled: boolean
  toggleInspector: () => void
  setInspectorOpen: (open: boolean) => void
  /** Responsive-only setter: does NOT mark the Inspector as user-toggled (used on width-boundary cross). */
  setInspectorOpenResponsive: (open: boolean) => void
  paletteOpen: boolean
  openPalette: () => void
  closePalette: () => void
}

const ViewContext = createContext<ViewContextType | null>(null)

/** Narrow = below the desktop breakpoint where the Inspector becomes an overlay drawer. */
const NARROW_QUERY = '(max-width: 1179px)'

export function ViewProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<AppView>('workspace')
  const [railCollapsed, setRailCollapsedState] = useState(false)
  // Desktop default: Inspector open. Narrow default: closed (so the overlay
  // scrim never blocks the app on first load / small windows).
  const [inspectorOpen, setInspectorOpenState] = useState(
    () => typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : !window.matchMedia(NARROW_QUERY).matches
  )
  const [inspectorUserToggled, setInspectorUserToggledState] = useState(false)
  const [paletteOpen, setPaletteOpenState] = useState(false)

  // Tracks the live Inspector state so the global Escape handler (bound once)
  // can decide whether dismissing should mark it as user-toggled.
  const inspectorOpenRef = useRef(inspectorOpen)
  useEffect(() => { inspectorOpenRef.current = inspectorOpen }, [inspectorOpen])

  const navigate = useCallback((view: AppView) => {
    setCurrentView(view)
    setPaletteOpenState(false)
  }, [])
  const toggleRail = useCallback(() => setRailCollapsedState(c => !c), [])
  const setRailCollapsed = useCallback((c: boolean) => setRailCollapsedState(c), [])
  const toggleInspector = useCallback(() => {
    setInspectorUserToggledState(true)
    setInspectorOpenState(o => !o)
  }, [])
  const setInspectorOpen = useCallback((o: boolean) => {
    setInspectorUserToggledState(true)
    setInspectorOpenState(o)
  }, [])
  const setInspectorOpenResponsive = useCallback((o: boolean) => {
    setInspectorOpenState(o)
  }, [])
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
        // Dismiss the Inspector ONLY when it is an overlay (narrow window). On
        // desktop it is a column and must not be closed by Escape — this also
        // keeps the Project Files drawer's own Escape-close working on desktop
        // (touching the Inspector state here would re-render the shell and
        // drop that drawer listener).
        const narrow = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          && window.matchMedia('(max-width: 1179px)').matches
        if (narrow && inspectorOpenRef.current) {
          setInspectorUserToggledState(true)
          setInspectorOpenState(false)
        }
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
        inspectorUserToggled,
        toggleInspector,
        setInspectorOpen,
        setInspectorOpenResponsive,
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
