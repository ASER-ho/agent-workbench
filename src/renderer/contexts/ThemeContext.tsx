import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default is Light (frozen v8.1 design). A persisted user preference from
  // `agent-workbench-theme` overrides this on mount; first launch (no saved
  // preference) stays Light.
  const [theme, setThemeState] = useState<Theme>('light')

  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.classList.toggle('light', t === 'light')
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.documentElement.setAttribute('data-theme', t)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    applyTheme(t)
    try {
      localStorage?.setItem('agent-workbench-theme', t)
    } catch {}
  }, [applyTheme])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage?.getItem('agent-workbench-theme') as Theme | null
      if (saved === 'light' || saved === 'dark') {
        setThemeState(saved)
        applyTheme(saved)
        return
      }
    } catch {}
    applyTheme('light')
  }, [applyTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
