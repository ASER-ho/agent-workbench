import { createContext, useContext, useState, type ReactNode } from 'react'

type TerminalLayout = 'bottom' | 'right'

interface TerminalLayoutContextType {
  layout: TerminalLayout
  maximized: boolean
  toggleLayout: () => void
  setLayout: (l: TerminalLayout) => void
  toggleMaximized: () => void
  setMaximized: (m: boolean) => void
}

const TerminalLayoutContext = createContext<TerminalLayoutContextType | null>(null)

export function TerminalLayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<TerminalLayout>('bottom')
  const [maximized, setMaximized] = useState(false)

  const toggleLayout = () => {
    setLayout(l => (l === 'bottom' ? 'right' : 'bottom'))
  }

  const toggleMaximized = () => {
    setMaximized(m => !m)
  }

  return (
    <TerminalLayoutContext.Provider value={{ layout, maximized, toggleLayout, setLayout, toggleMaximized, setMaximized }}>
      {children}
    </TerminalLayoutContext.Provider>
  )
}

export function useTerminalLayout() {
  const ctx = useContext(TerminalLayoutContext)
  if (!ctx) throw new Error('useTerminalLayout must be used within TerminalLayoutProvider')
  return ctx
}
