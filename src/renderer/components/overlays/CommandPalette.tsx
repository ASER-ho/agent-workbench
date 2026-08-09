import { useState, useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { useView } from '../../contexts/ViewContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useLocale } from '../../contexts/LocaleContext'

interface PaletteCommand {
  id: string
  label: string
  run: () => void
}

export default function CommandPalette() {
  const { paletteOpen, closePalette, navigate, toggleInspector, toggleRail } = useView()
  const { toggleTheme } = useTheme()
  const { t, locale } = useLocale()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Inline zh/en fallback for text not (yet) covered by LocaleContext keys.
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en)

  const commands = useMemo<PaletteCommand[]>(
    () => [
      { id: 'go-workspace', label: t('palette.goWorkspace'), run: () => navigate('workspace') },
      { id: 'go-verification', label: t('palette.goVerification'), run: () => navigate('verification') },
      { id: 'go-environment', label: t('palette.goEnvironment'), run: () => navigate('environment') },
      { id: 'go-settings', label: t('palette.goSettings'), run: () => navigate('settings') },
      { id: 'toggle-theme', label: t('palette.toggleTheme'), run: () => toggleTheme() },
      { id: 'toggle-inspector', label: t('palette.toggleInspector'), run: () => toggleInspector() },
      { id: 'toggle-rail', label: t('palette.toggleRail'), run: () => toggleRail() }
    ],
    [t, navigate, toggleTheme, toggleInspector, toggleRail]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(c => c.label.toLowerCase().includes(q))
  }, [commands, query])

  // On open: remember the previously focused element and focus the search box.
  useEffect(() => {
    if (paletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      previouslyFocused.current = document.activeElement as HTMLElement | null
      inputRef.current?.focus()
    }
  }, [paletteOpen])

  // On close: restore focus to wherever it was before the palette opened.
  useEffect(() => {
    if (!paletteOpen) {
      previouslyFocused.current?.focus?.()
      previouslyFocused.current = null
    }
  }, [paletteOpen])

  // Keep the selection inside the (possibly narrowed) filtered list.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedIndex(0)
    } else if (selectedIndex >= filtered.length) {
      setSelectedIndex(filtered.length - 1)
    }
  }, [filtered.length, selectedIndex])

  const runCommand = (cmd: PaletteCommand) => {
    cmd.run()
    closePalette()
  }

  const getFocusables = (): HTMLElement[] => {
    if (!dialogRef.current) return []
    return Array.from(dialogRef.current.querySelectorAll<HTMLElement>('input, button'))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      // Focus trap: cycle focus among the input and command rows, wrapping around.
      e.preventDefault()
      const focusables = getFocusables()
      if (focusables.length === 0) return
      const current = document.activeElement as HTMLElement | null
      const idx = current ? focusables.indexOf(current) : -1
      const nextIdx = e.shiftKey
        ? (idx - 1 + focusables.length) % focusables.length
        : (idx + 1) % focusables.length
      focusables[nextIdx]?.focus()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filtered.length === 0) return
      const next = (selectedIndex + 1) % filtered.length
      setSelectedIndex(next)
      if (inputRef.current && document.activeElement !== inputRef.current) {
        rowRefs.current[next]?.focus()
      }
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filtered.length === 0) return
      const next = (selectedIndex - 1 + filtered.length) % filtered.length
      setSelectedIndex(next)
      if (inputRef.current && document.activeElement !== inputRef.current) {
        rowRefs.current[next]?.focus()
      }
      return
    }
    if (e.key === 'Enter') {
      if (filtered.length > 0) {
        const cmd = filtered[Math.min(selectedIndex, filtered.length - 1)]
        if (cmd) {
          e.preventDefault()
          runCommand(cmd)
        }
      }
      return
    }
  }

  if (!paletteOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center"
      style={{ paddingTop: '12vh', background: 'rgba(0, 0, 0, 0.55)' }}
      onClick={closePalette}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.searchPlaceholder')}
        className="w-full max-w-[560px] self-start overflow-hidden rounded-xl"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border-color)' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder={t('palette.searchPlaceholder')}
            spellCheck={false}
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
              {tr('无匹配结果', 'No matches')}
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                ref={el => {
                  rowRefs.current[i] = el
                }}
                type="button"
                onMouseEnter={() => setSelectedIndex(i)}
                onFocus={() => setSelectedIndex(i)}
                onClick={() => runCommand(cmd)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors"
                style={{
                  background: i === selectedIndex ? 'var(--accent)' : 'transparent',
                  color: i === selectedIndex ? '#fff' : 'var(--text-primary)'
                }}
              >
                <span>{cmd.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
