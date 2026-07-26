import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Tab, FileType } from '../../shared/ipc-types'

interface TabContextType {
  tabs: Tab[]
  activeTabId: string | null
  openTab: (filePath: string, label: string, fileType: FileType, icon?: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setDirty: (id: string, dirty: boolean) => void
  updateSavedContent: (id: string, content: string) => void
}

const TabContext = createContext<TabContextType | null>(null)

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const openTab = useCallback((filePath: string, label: string, fileType: FileType, icon?: string) => {
    const id = filePath
    setTabs(prev => {
      const exists = prev.find(t => t.id === id)
      if (exists) return prev
      return [...prev, { id, label, filePath, fileType, icon, dirty: false }]
    })
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)

      // If closing active tab, activate previous one
      if (id === activeTabId) {
        const newIdx = Math.min(idx, next.length - 1)
        setActiveTabId(newIdx >= 0 ? next[newIdx]?.id ?? null : null)
      }
      return next
    })
  }, [activeTabId])

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const setDirty = useCallback((id: string, dirty: boolean) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, dirty } : t))
  }, [])

  const updateSavedContent = useCallback((id: string, content: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, savedContent: content, dirty: false } : t))
  }, [])

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, closeTab, setActiveTab, setDirty, updateSavedContent }}>
      {children}
    </TabContext.Provider>
  )
}

export function useTabs() {
  const ctx = useContext(TabContext)
  if (!ctx) throw new Error('useTabs must be used within TabProvider')
  return ctx
}
