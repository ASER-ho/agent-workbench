import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type Density = 'compact' | 'standard' | 'comfortable'

interface DensityContextType {
  density: Density
  setDensity: (d: Density) => void
}

const DENSITIES: readonly Density[] = ['compact', 'standard', 'comfortable']

const DensityContext = createContext<DensityContextType | null>(null)

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>('standard')

  const applyDensity = useCallback((d: Density) => {
    document.documentElement.setAttribute('data-density', d)
  }, [])

  const setDensity = useCallback((d: Density) => {
    setDensityState(d)
    applyDensity(d)
    try {
      localStorage?.setItem('agent-workbench-density', d)
    } catch {}
  }, [applyDensity])

  // Restore from localStorage on mount; fall back to standard
  useEffect(() => {
    try {
      const saved = localStorage?.getItem('agent-workbench-density') as Density | null
      if (saved && DENSITIES.includes(saved)) {
        setDensityState(saved)
        applyDensity(saved)
        return
      }
    } catch {}
    applyDensity('standard')
  }, [applyDensity])

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  )
}

export function useDensity() {
  const ctx = useContext(DensityContext)
  if (!ctx) throw new Error('useDensity must be used within DensityProvider')
  return ctx
}
